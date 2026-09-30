# WILDMARCH — Design Bible, page 17: art and audio

**Status:** v0.1 draft — 2026-09-29. **Nothing is built.** Owner of this page: how Wildmarch looks and
sounds — Chibi 2 characters and how gear shows on them, creature bodies, spell effects and the rules
that keep a fight readable, how telegraphs are drawn, the environment of each region, the interface
style, the graphics tiers, and all audio: voices, speech, boss lines, sound effects, ambience and the
music question.

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
over any body. The 30 classes of canon are exactly the 30 keys in that file. Farhold's `classwear.js`
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
feet, neck, ring ×2, main hand, off hand, light, mount).

| Equipment slot | Avatar slot | Rule |
|---|---|---|
| Weapon | `held` | `heldLookFor(item)` — the weapon's model id (`fh_*` procedural weapons in `chibi2-weapons.js`, 18 + the originals) |
| Off hand | `offhand` | `offhandLookFor(item)` — shield (strapped), dagger/second weapon, focus (grimoire, orb, `relic`, `idol` — Farhold `foci.js`), quiver |
| Head / chest / legs / feet | `hat` / `top` / `bottom` / `shoes` | If the item carries `look.worn` (class starting pieces, **every Set, Unique and Legendary in Wildmarch**), that exact part and colours; otherwise the base's **armour tier** picks a part from the `ARMOUR_LOOK` table and the rarity tints it (Farhold's tints: Uncommon `#4a5a7a`, Rare `#8a7a4a`, Epic and above `#c8a24a`) |
| Light | `offhand` or `decor` | A torch is held when the off hand is free and the weapon is one-handed and not a bow; otherwise `belt_torch` on the belt. Lanterns and wisp lamps hang from the belt (`decor`) |
| Back (page 08's back slot) | `cape` | cape, shoulder_cape, half_cape, fur_mantle, feather_mantle, shawl, travel_cloak, tattered_cape |
| Shoulders | `pauldrons` / `mantle` / `capelet` (Chibi 2 gear, page 08 §2.1) | Same `look.worn` / armour-tier rule as head and chest |
| Hands | hands | Same `look.worn` / armour-tier rule |
| Waist | `belt` / `belt_pouches` | Same rule; the belt is also where a light hangs when it is not held |
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
changes currently rebuild a variant") — fine for a player at the Wardrobe, and the reason a raid of 20
players each in different dyes costs 20 templates (page 16 §17.3 budgets assume that).

### 2.8 Forms and transformations

| Class form (page 06) | Body | Notes |
|---|---|---|
| Druid Bear / Cat / Owl / Stag | `bear`, `cat`, `owl`, `deer` (antlers on) creature types | Tinted in the druid's colours; the creature's `fxHeight` sets aura size; swap by fading the old body out over 0.25 s while a `nature` `pillar` plays |
| Dragon Knight Dragon Form (level 40) | `drake` scaled to 1.6 × the character's height, aspect colour (fire/ice/storm) | Wings from the creature plan |
| Demon Hunter Demon Form | Chibi 2 body with `horns_hair`, `glow` eyes, `chest_glow` extra, `lightning_arcs`, dark skin tint, scaled ×1.15 | No new body plan needed |
| Necromancer thralls | Chibi 2 Undead race + `staff_skull` etc. | |
| Ranger's hunting cat | `saber cat` creature | |
| Tinker's sentry | `golem` biped with `blocky` boxes, scaled 0.5 | |
| Shaman spirits | `wisp` / `elemental` float bodies | |

### 2.9 What Wildmarch adds to Chibi 2 (new work)

| Addition | Why | Budget |
|---|---|---|
| **LOD 1 body**: one merged mesh, no face detail, fewer ring segments | Crowds in towns and raids (page 16 §17.3) | ≤ 2,500 triangles, 1 mesh |
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

Rules:

- **Every creature is folded** by `compactCreature` (one draw call per material instead of one per bead:
  Farhold's horse went 34 → 1–2 draws; the landing scene 104 → 72).
- **Size** comes from the monster row (page 10); auras and effects scale themselves to `fxHeight`.
- **Bosses** are a scaled creature or Chibi 2 body **plus** unique parts (a crown, a glowing core,
  chains) — page 10/12/13 describe each; a boss that needs a body plan that does not exist (a sea
  serpent's coils above water, a many-armed thing) is flagged in its page and becomes a creature-plan
  task in the roadmap ([page 18](18-ROADMAP.md) M14+).
- **Rank marks** (page 10): Champion = a thin gold ring under the feet + name in gold; Rare = a silver
  crown glyph over the nameplate + a slow silver shimmer on the body (emissive pulse, no extra draw);
  Elite pack leader = 1.15× scale.
- Beasts do not talk; they **snarl** (Lingo `beast_snarl` narration in the log) and have creature sounds
  (§8.2).

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
page 08 asks for a new `rarity_mythic.svg` gem for Legendary — an art task in page 18 M4.

### 4.2 Element colours (reuse: `avatar-3d/js/spellfx.js` `ELEMENT_PALETTE`)

| Element | Mid colour | Reads as |
|---|---|---|
| fire | `#ff8a1a` | flame cone, embers, dark smoke |
| ice | `#aee6ff` | tumbling shards, frost mist |
| lightning | `#fff07a` | instant zigzag, forks |
| poison | `#7ae04a` | bubbles, green haze |
| shadow | `#9458e0` | dark void core, violet rim, tendrils |
| holy | `#ffe69a` | spinning sigil, golden motes, feathers |
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
6. Loot beams, quest pillars (`waylight.js`), the duel flag ring and the arena Closing Circle (page 15)
   are **vertical** or use the danger vocabulary on purpose; nothing else draws a coloured ground ring.

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
| **A sky you can reflect** | Physical sky rendered into a PMREM probe whenever the sun moves |
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
- **Sky colour as a table** (`sky-palette.js`): a nine-band sunset table; the grade and the sky agree about
  the time of day.
- **One wind** object for trees, grass, rain and banners.
- **Wet ground** builds over 30 s of rain and dries over 90 s.
- **Zero-length normals** anywhere (a closed ring, a point) light to NaN — Chibi 2's `SkinBuilder.add`
  already fixes its own; region geometry must too.

### 6.2 Time of day

Canon: a **60-minute day, 45 day + 15 night**, realm-wide. Keyframes (sky palette table): dawn (0:00–
3:00), morning, noon (at 22:30 into the day), afternoon, golden hour (40:00–45:00), dusk, night (45:00–
60:00, moon + stars, darker — canon: "night is darker and more dangerous"). At night the **light floor**
(Farhold `light.js` "the floor under the night ambient") keeps silhouettes and telegraphs readable;
carried torches matter (Farhold `nightlights.js`: people carry lights at night). **Telegraphs are
unaffected by night.**

### 6.3 Weather

**(reuse: `worldgen/js/weather.js`.)** 14 states: clear, fair, cloudy, overcast, drizzle, rain, storm
(thunderstorm), snow, blizzard, fog, sandstorm, ashfall, emberstorm, ionstorm. The server picks the
state per region from the region's allowed list (below) with a `WeatherClock` seeded by realm + region +
day, holding a state for minutes and crossfading. Weather never hides a telegraph: fog density is
capped at a 90 m view in blizzard/sandstorm, and telegraphs are not fogged.

### 6.4 Region art direction

| Region | Palette | Ground surfaces | Vegetation / props | Sky & light | Weather allowed | Ambience bed |
|---|---|---|---|---|---|---|
| `hearthvale` 1–6 | warm greens, wheat gold, red roofs | grass, tilled soil, dirt road, river stones | orchards (fruit trees), hedgerows, fences, haystacks, windmills, oaks | soft morning light, warm golden hour | clear, fair, cloudy, drizzle, rain | `ambience.forest` (birds) → farm variant (new) |
| `mossfen` 5–12 | olive, peat brown, murky teal water | mud, moss, peat, reeds, boardwalk | stilt houses, dead trees, cattails, lily pads, mushrooms | hazy, low sun, green-tinted fog | fog, drizzle, rain, overcast, storm | `ambience.marsh` |
| `greyridge` 10–18 | slate grey, pine green, rust | rock (triplanar), gravel, snow on peaks, quarry dust | pines, cliffs, mine carts, scaffolds, rail tracks | crisp, long shadows | clear, cloudy, overcast, snow (high), rain | `ambience.mountain` |
| `highcourt` (capital) | white stone, blue banners, gold trim | cobbles, marble, gardens | walls, towers, market stalls, fountains, statues | bright; lamps at night | clear, fair, cloudy, drizzle | `ambience.town` (big city variant, new) |
| `sunscar` 16–24 | sand, ochre, turquoise glass | sand, cracked clay, glass shards | mesas, cacti, dunes, palms at the oasis, glass tombs | hard white sun, heat shimmer (post pass, High+) | clear, fair, sandstorm | `ambience.wind` (desert variant) |
| `whisperwood` 22–30 | deep teal, silver, moonlight violet | forest floor, roots, moss, glowing moonwell stone | giant old trees, silver birches, ferns, glowing flowers | dappled light, shafts (High), cool night glow | fair, cloudy, fog, drizzle, rain | `ambience.forest` (night variant) |
| `cinder_steppe` 28–36 | ash grey, dry gold grass, war-camp red | ash, dry grass, scorched earth | burnt trees, orc palisades, bone totems, war banners | smoky orange haze | clear, cloudy, ashfall, storm | `ambience.wind` + distant drums (new) |
| `frostmantle` 34–42 | white, ice blue, dark rock | snow, ice, rock | frozen pines, ice spires, glaciers, frozen waterfalls | low pale sun, long blue shadows, aurora at night (new sky layer) | clear, cloudy, snow, blizzard, fog | `ambience.wind` (cold variant) |
| `drowned_coast` 40–48 | sea grey, green bronze, bone white | wet sand, tidal rock, sunken paving | sunken city ruins, kelp, wrecks, barnacled statues, cliffs | overcast, silver light, sea spray | overcast, drizzle, rain, storm, fog | new `ambience.coast` (waves, gulls) |
| `riftmarch` 46–54 | violet, arcane cyan, broken stone | cracked rock, crystal, rift glass | floating stones, crystal clusters, broken arches | shifting sky tint, ion glow | cloudy, ionstorm, fog, clear | `ambience.void` |
| `emberthrone` 52–60 | black basalt, lava orange, ember red | basalt, lava crust, ash | lava rivers, obsidian spires, the Ember Legion's forts | red underlight from lava, ember particles | ashfall, emberstorm, clear | `ambience.fire` |
| `veilspire` 60 | pearl, deep blue, veil violet | pale stone, mist, glass | the Spire, veil curtains, drifting motes | twilight always | fog, clear, ionstorm | new `ambience.veil` |

Dungeons (page 12) and raids (page 13) set their own palette, fog colour and bed in their data; they are
**interiors** with a ceiling where the architecture has one, and the camera fades any ceiling or wall
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
distance, scatter and grass, textures, fog, wet ground, weather particles, water, stars, spell effects,
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
| Emissive rank shimmer on rares/champions (§3) | off | on | on | on | |
| Telegraph pattern animation | static | animated | animated | animated | patterns are always **drawn**; Low only stops them moving |
| Weapon motion trails | off | on | on | on | §5 rule 9 |

**Never scaled by any preset**: telegraphs, cast bars, boss banners, boss voice lines, the danger sounds.

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
| `otherPlayers` (new, a child of `sfx`) | `set.audio.otherPlayers` (default 70%) | other players' spells and weapons, so a raid is not a wall of noise |
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
| Telegraphs and boss cues (**page 11 §6 names them and gives the recipe idea**; this page builds the recipes) | `tg_danger`, `tg_danger_lethal`, `tg_void_place`, `tg_void_in`, `tg_soak`, `tg_soak_pip`, `tg_safe`, `tg_target_you`, `tg_target_other`, `tg_benefit`, `tg_tether`, `tg_tether_snap`, `tg_cast_interruptible`, `tg_interrupt_ok`, `tg_interrupt_fail`, `tg_adds`, `tg_enrage`, `tg_phase`, `tg_dialog`, `tg_fixate` |
| Boss (extra) | `boss.pull` (arena lock horn), `boss.defeat` (victory sting) |
| Movement | `dodge.roll`, `dodge.perfect` (dodged inside the last 0.2 s), `mount.summon`, `mount.gallop` loop, `swim.stroke`, `travel.step.snow`, `travel.step.sand`, `travel.step.wood`, `travel.step.water` |
| Class mechanics | one `mech.<class>.<event>` per mechanic event page 06 lists (combo point, overheat, form shift, song verse, charm break…) — about 60 |
| Social | `ui.whisper`, `ui.invite`, `ui.readycheck`, `ui.raidwarning`, `ui.groupfound`, `ui.mail`, `ui.sold`, `ui.trade.lock`, `ui.trade.done`, `ui.duel.countdown` |
| Unlocks and loot | `unlock.feature` (canon rule 5: every unlock has a sound), `unlock.spell`, `unlock.talent`, `calling.complete`, `loot_legendary` (page 08: the Legendary beam's low hum, a loop while the beam stands) |
| World | `waystone.use`, `portal.open`, `chest.open`, `door.dungeon`, `event.start`, `worldboss.horn` |
| Ambience | `ambience.farm`, `ambience.city`, `ambience.coast`, `ambience.veil`, `ambience.forest.night`, `ambience.desert`, `ambience.cold`, `ambience.warcamp` |

A node test (existing pattern) fails if an element or status is added to `spellfx.js` without a sound;
a new test fails if a telegraph kind or boss cue in `mechanics.json` has no `tg_*` id in the catalogue.

### 8.3 Ambience

`data/sound-map.json` names the bed for each region, town, dungeon and raid (the table in §6.4). The
Farhold rules stay (`sound.js`): the bed **crossfades** when you move between places; **inside** =
`ambience.cave` unless the place says otherwise; storms swap to `ambience.wind`; the ambience bus is
capped and sits **−40 LUFS**, far under everything, because a bed plays for an hour. Night adds a night
layer (crickets in Hearthvale, owls in Whisperwood) at −44 LUFS. Footsteps pick soft/hard/snow/sand/wood/
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
| Accent | Ember orange for the player's own highlights; **never** a telegraph colour at full strength in the HUD except in warnings |
| Icons | **SVG**, generated: a spell icon = the element colour + the spell's **shape glyph** (`prototypes/farhold/js/spellshapes.js`, one table for glyph and caption) + a class sigil corner. Item icons from base type silhouettes tinted by rarity. The owner's Font Awesome Pro is available for UI glyphs (settings cog, mail, group), but the playground rule for games is to prefer SVG assets — use FA only as SVG exports |
| Tooltips | `shared/tooltip.js`: 150 ms delay, flips at the screen edge, keyboard-focus friendly; item cards via one renderer (Farhold `hud.itemCard`) everywhere — bags, chat links, the Trading Post, loot popups |
| Numbers | Always through `shared/format.js` (at most two decimals; health whole) — nothing may render "25.02000000000001" |
| Wording | Farhold `WORDING.md`: numbers, not feelings; a refusal says what to do next |
| HUD scale | `set.interface.uiScale` 50–200% and `set.access.textSize` (page 04); every HUD element anchors to a screen corner and scales from it |
| Frames | Party/raid frames, target frame with cast bar (grey / gold-bordered), boss frame across the top with phase marks on the health bar |
| Unlock card | Canon rule 5: a card (framed, the feature's icon, one plain sentence of what it does and the key that uses it), `unlock.feature` sound, entry on the Unlocks screen |
| Accessibility | Page 04 §10: telegraph palettes and patterns (§4.5), `reduceFlashes` (under 3 flashes a second, 20% brightness change — the art must respect it: lightning, crits, enrage flashes, the Legendary shimmer), text size, hold-or-toggle. A dyslexia-friendly font option is a question |

---

## 10. Asset licences

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

## 11. Open questions (to `QUESTIONS.md`)

1. Music: none + stingers (recommended for now), generated, or tracks? (Pages 04 and 11 already assume a
   `music` bus and stingers exist.)
2. Aurora and other region-specific sky layers — worth the art time?
3. Font Awesome Pro in the shipped game, or SVG-only?
4. Dyslexia-friendly font option?
5. Telegraph sound loudness: page 11's `ui` target (−26 LUFS) or this page's `telegraph` category (−17)?
