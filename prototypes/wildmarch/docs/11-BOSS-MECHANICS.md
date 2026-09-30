# WILDMARCH — Design Bible, page 11: Boss mechanics and the telegraph language

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Nothing is built. This page **owns the mechanic vocabulary**: the
colours, shapes, warning times, sounds and HUD warnings that every dangerous thing in Wildmarch uses, the
boss frame and cast bar, the centre-screen banner, boss dialog and dialog opportunities, phases, enrage,
adds, interrupts, dispels, tank handoffs, tethers, stacks, line of sight, fixates, knockbacks, environmental
hazards, puzzle bosses, scaling, how followers handle mechanics, how **rarity monsters** (champion packs, rares,
greater rarities) telegraph, and a **library of 121 named mechanics** (`mech_*`: 99 library rows + 13
environment hazards + 9 puzzle patterns) that [page 12](12-DUNGEONS.md) (dungeons), [page 13](13-WORLD-BOSSES.md)
(world bosses) and [page 10](10-BESTIARY.md) (monsters, monster rarities, warlords) cite by id.

**Round 2 in one paragraph.** Everything here is tuned for **at most 5 players** (world bosses are the only
exception, §22.4). Raids are parked in `WISHLIST.md`, so the raid rows, the 10/20-player scaling, the raid
Speaker and raid frames are gone. The two difficulties are **Normal** and **Challenge**; **Depth** is a dial on
top (page 12) and never shortens a warning. Tank swaps became **tank handoffs** built for one tank plus hybrids
(§16). There is no limit on in-combat revives. Boss timers and the eight world markers (Sword, Shield, Anvil,
Crown, Leaf, Wave, Key, Eye) stay (§7.2). Greater-rarity monsters use this same vocabulary (§22.5).

Pillar 3 of the overview is the reason this page exists: **every attack that can kill you is telegraphed
before it lands, and colour, shape and sound mean the same thing everywhere** (00 §2, §10 rule 3).

---

## Contents

1. How other pages use this one; what is reused
2. Units and roles
3. The colour language
4. Warning times
5. Shapes
6. Sounds
7. The boss frame and the cast bar
8. The centre-screen warning banner
9. Boss dialog: lines that warn
10. Dialog opportunities: the boss asks, a player answers
11. Phases, arena lock, transitions and resets
12. Interrupts, crowd control and the break bar
13. Enrage (soft and hard)
14. Adds
15. Dispels
16. Tank handoffs (was: tank swaps)
17. Tethers
18. Debuff stacks
19. Knockbacks and ledges
20. Environmental hazards
21. Line of sight, fixates, kiting, and facing / turn rates
22. Scaling: up to 5 players, solo + followers, the open world, world bosses, and rarity monsters
23. How followers handle mechanics
24. Puzzle bosses
25. The design rules (fairness)
26. The mechanic library (121 mechanics)
27. Data shapes
28. Tests the build must have

---

## 1. How other pages use this one

- A boss on page 12 or 13 is written as a **list of mechanics**, each either a library id with its numbers
  overridden (`mech_quake_ring` at 8 m, 30% RH) or a bespoke mechanic that still uses a colour, a shape and a
  warning time from this page.
- A monster ability on page 10 cites a library mechanic (`mechanic: "mech_charge_line"`) the same way.
- Nothing may invent a new colour meaning. If a page needs a new kind of warning, it asks here
  (a canon change request) rather than drawing it purple because purple was free.

### 1.1 What already exists in the playground (reuse)

| Piece | File | Used for |
|---|---|---|
| Boss phases `{ at, modifier, say }` fired at health fractions | Farhold `data/enemies.json` bosses, `js/actors.js` phase loop | the phase trigger (§11); `say` becomes a dialog line id |
| Boss adds `spawns: { id, count, at: [...] }` | Farhold `data/warbands.json` warlords, `js/actors.js` | add waves (§14) |
| World boss minions `{ first, add, every, max, radius }` | Farhold `data/worldbosses.json` | open-world boss adds (§22.4) |
| Spell effects: `decal`, `disc`, `ring`, `beam`, `pillar`, `aoe`, `breath`, `arc`, `orbitOrb`, 23 status auras | `avatar-3d/js/spellfx.js` (`STATUS_FX`, `ELEMENTS`) | drawing the telegraph and the hit; status auras on bodies |
| Batched sprite effects | `avatar-3d/js/spellfx-batched.js` | many simultaneous ground markers at a world boss |
| Hit-stop, shake, knockback with rank resistance, stagger with diminishing returns | Farhold `js/combat-feel.js` | knockbacks (§19) and the break bar (§12) |
| Three-part swing: wind-up / damage / recovery | Farhold R14, `js/combat-feel.js` | every telegraphed attack is wind-up → active → recovery |
| Sound effects with loudness categories, `play(id, { pan })` | `sfx/js/sfx.js`, `sfx/js/loudness.js` | telegraph sounds (§6) |
| Formant voices per role, varied by seed | `shared/voices.js` | boss voices (§9) |
| Lingo lines with tone tags, anti-repeat | `lingo/js/lingo.js`, Emberveil `js/talk.js` boss openers | boss barks and retry lines (§9) |
| Speech bubbles clamped inside the view | Emberveil stage bubbles | boss bubbles |
| Shader recompile trap: never toggle `light.visible` or dispose fx materials per hit | playground memory "three.js shader-recompile stutter" | every telegraph uses pooled materials |
| Lanternfall telegraph and void-zone rules (lit rim, warm-up, ticks never on the entry frame, grabs end on their own) | `prototypes/lanternfall/docs/05-BESTIARY-BOSSES.md` §8, "Boss rules shared by all six" | §3, §11, §25 (good ideas reused with our names) |

Everything else on this page is **(new)**.

---

## 2. Units and roles

Same units as page 10 §1.1:

- **RH** — reference health: the max health of an at-level **Damage** player in gear of the content's
  expected item level. Damage on this page is **% RH**. A **tank buster** is written as % **tank RH**
  (a tank has about 1.6 × RH; page 05 owns).
- **One-shot** — a hit of ≥ 100% RH on a non-tank, or any hit designed to kill whoever is caught
  (a "lethal" mechanic). Also counts: a mechanic whose failure wipes the group.
- Warning time **N / C** means Normal / Challenge. Depth uses the numbers of whichever difficulty it is run on
  (page 12); it adds health, damage and mechanics, never a shorter warning.

### 2.1 Damage categories

| Category | Damage on the one caught | Minimum warning | Notes |
|---|---|---|---|
| **chip** | ≤ 5% RH | none (may warn in 0.5–1.0 s or not at all) | swarm death pops, tick damage, a basic swing |
| **light** | 5–15% RH | the difficulty minimum (§4) | |
| **heavy** | 15–60% RH | the minimum + 0.3 s | |
| **severe** | 60–99% RH | the minimum + 0.5 s | never two severe hits land inside 1.5 s on the same player |
| **lethal** | ≥ 100% RH, or wipe on failure | **3.0 s everywhere** | never overlaps another lethal (§25) |

---

## 3. The colour language

Seven colours. Each **means one thing**, everywhere, on every difficulty, for every boss, trash pack,
champion and world boss. Shape (§5) says *where*; colour says *what to do*.

| Colour | Name | Meaning | Default fill | Edge | Pattern (always on, not only in colour-blind mode) | What you do | Sound (§6) | HUD shows |
|---|---|---|---|---|---|---|---|---|
| **RED** `#ff3b30` | **Danger zone** | hits **once** when the fill closes | fill grows from the **edge inward**, 30% → 55% opacity | solid 0.12 m line, 100% | diagonal hatch lines 45°; the hatch pulses faster in the last 0.5 s | **leave before it fills** | `tg_danger` rising swell, ends on a click at the hit | nothing (it is on the ground); banner only for severe/lethal |
| **PURPLE-BLACK** `#140a1e` fill / `#8a3ae0` rim | **Void zone** | persists; damages every **0.5 s** while you stand in it | dark swirl, 70% | glowing violet rim, 2 Hz pulse | slow spiral texture + rising bubbles | **stay out**; don't drag it where the group stands | `tg_void_place` hiss when it lands; `tg_void_in` low bubble loop while you are inside | debuff icon "Standing in void" + red screen-edge tint while inside |
| **ORANGE** `#ff9a1f` | **Soak** | needs **N** players inside when it fills, or it hits **everyone** | fill grows edge-in | solid, with **N pips** (white dots) spaced on the rim; a pip turns solid white for each player inside | inward-pointing chevrons around the rim | **get N people in** (not more than needed if a debuff says so) | `tg_soak` three low drum hits; a bell per filled pip | pips count over the circle; banner "Soak — 3 needed" |
| **BLUE** `#3aa0ff` | **Safe zone** | be **inside** it when the cast finishes; outside is hit (usually room-wide) | light 15% fill, no growth | double ring, 0.08 m + 0.04 m, dashed outer | shield glyph in the centre; rings rotate slowly | **get in** | `tg_safe` bright chime on appear, sustained pad until the cast ends | banner "Get to the blue!" with cast bar |
| **YELLOW** `#ffd23a` | **Targeted** | follows **one player**, name shown; hits where it is when the timer ends | circle outline + 20% fill that **empties** as time runs out (a clock wipe) | solid | crosshair glyph + the player's name floating above | the named player **moves away** from others (spread) or to a marked spot | `tg_target_you` sharp ping + voice "You!" for the target; soft ping for others | personal banner "YOU are targeted — spread"; party frame outline yellow |
| **GREEN** `#4cd964` | **Beneficial** | stand in it for a buff, heal, cleanse or stack removal | 25% fill, soft | soft dashed | plus-sign glyphs drifting upward | **use it** (usually: the right person uses it) | `tg_benefit` harp glide | buff icon while inside |
| **WHITE** `#f4f4f4` | **Tether** | a line between two bodies; the mechanic says break it or keep it | — | 0.06 m line with beads every 0.5 m | beads travel along the line toward the end that will be hit | follow the tether's rule (§17) | `tg_tether` taut hum, pitch rises with stretch; `tg_tether_snap` on break | tether icon on both players' frames with a distance readout |

### 3.1 Rules for the colours

1. **One colour, one meaning.** An element (fire, frost…) never changes the colour of a telegraph. A fire
   danger zone is red with flame particles on its edge; a frost danger zone is red with frost particles on
   its edge. The **particles** show the element; the **colour** shows the rule.
2. **Red and purple are the only colours that hurt.** Orange hurts only if under-soaked; blue, yellow and
   white hurt only by their stated rule.
3. **Monster buffs never use ground colours.** A monster shielding itself shows a shell on its body (gold for
   immune, blue-grey for block), never a blue ring on the ground (page 10 `mod_aegis_bearer`).
4. **Player spells** that draw on the ground use their **class colour at 40% opacity with no hatch, no rim
   pulse** (page 17), and a setting can hide allied ground effects (`set.combat.ally_ground_fx`, page 04).
   Enemy telegraphs are always drawn **above** player effects.
5. **Knockback** has no colour of its own: it is a danger zone (red) with **white arrows** in the fill showing
   the push direction and distance (§19).
6. **Unavoidable** room-wide damage (a group-wide pulse the healer must heal) shows as a thin red ring
   racing out from the boss across the whole room **plus** the banner "Brace!" — it never pretends you could
   have dodged it.
7. **Reserved: dashed pale cyan `#7fe8ff`** belongs to the **Oracle's** early warnings (Foresight ghosts,
   [classes/oracle.md](classes/oracle.md)). **No real telegraph ever uses it**, and no boss or monster effect may
   be tinted near it (canon 00 §10).
8. **Class tethers are gold, boss tethers are white.** A tether a player's spell draws (Cleric Lifeline, Knight
   Vow, Paladin links…) is **gold**; only a boss or monster mechanic draws a **white** tether (§17).

### 3.2 Colour-blind and high-contrast alternates

Every telegraph already carries a **pattern** (column above), so it can be read with no colour at all. The
setting `set.access.telegraph_palette` (page 04 owns; values below) swaps the hues:

| Meaning | default | `deutan` (red-green) | `protan` (red-weak) | `tritan` (blue-yellow) | `mono` (high contrast) |
|---|---|---|---|---|---|
| Danger | `#ff3b30` | `#ff2d95` magenta-red | `#ff7a00` bright orange-red | `#ff3b30` | white hatch on black 60% |
| Void | `#140a1e` / `#8a3ae0` | same | same | `#140a1e` / `#c040c0` | black fill, white spiral |
| Soak | `#ff9a1f` | `#ffb000` | `#ffe000` yellow-orange | `#ff5fa0` pink | white chevrons, grey fill |
| Safe | `#3aa0ff` | `#00c8ff` | `#00c8ff` | `#00e0c0` teal | white double ring, shield glyph |
| Targeted | `#ffd23a` | `#ffe860` | `#ffe860` | `#ff8ac8` | white crosshair, name in black box |
| Beneficial | `#4cd964` | `#40a0ff` blue | `#40a0ff` blue | `#4cd964` | white plus-signs |
| Tether | `#f4f4f4` | same | same | same | white with black outline |

Also in the accessibility tab (page 04 owns keys; proposed here):

| Key | Values | Default | Effect |
|---|---|---|---|
| `set.access.telegraph_palette` | default, deutan, protan, tritan, mono | default | table above |
| `set.access.telegraph_outline` | thin, thick, extra | thin | edge width 0.12 / 0.2 / 0.3 m |
| `set.access.telegraph_opacity` | 60–150% | 100% | multiplies fill opacity |
| `set.access.telegraph_glyphs` | on, off | on | glyphs (crosshair, shield, plus, chevrons) |
| `set.access.telegraph_sounds` | on, off | on | the §6 sounds |
| `set.access.banner_size` | small, normal, large | normal | §8 |
| `set.access.screen_flash` | on, reduced, off | on | lethal-warning red edge flash |
| `set.access.spoken_warnings` | off, lethal only, all | lethal only | a narrator voice (reuse: Emberveil Narrator voice) reads the banner |

---

## 4. Warning times

"Warning time" is from the moment the telegraph first appears to the moment it hits. It is the **fill time**
for a danger zone, the **clock** for a targeted circle, the **cast** for a safe zone or soak.

### 4.1 Minimums by context and category

| Context | light (5–15%) | heavy (15–60%) | severe (60–99%) | lethal |
|---|---|---|---|---|
| Open world: normal, champion pack, rare, greater-rarity carrier (page 10) | 2.0 | 2.0 | 2.5 | **not allowed** |
| Open world: named rare, elite, warlord | 2.0 | 2.0 | 2.5 | 3.5 |
| World boss (page 13; any number of players) | 2.0 | 2.0 | 2.5 | 3.5 |
| Dungeon **Normal**; solo + followers adds +0.3 s | 1.5 | 1.8 | 2.0 | 3.0 |
| Dungeon **Challenge** | 1.2 | 1.5 | 1.7 | 3.0 |
| Dungeon at any **Depth** | the row of the difficulty the run uses — Depth never lowers a floor | | | |
| Levelling regions 1–2 (Hearthvale, Mossfen) and dungeons d01–d02 on Normal | ×1.25 on all of the above | | | |

These are **floors**. Speed-up effects (a Fleet champion pack, a Swift greater rarity, a Depth modifier, an enrage, haste) never
push a warning below its floor — they shorten recovery and intervals instead (reuse idea: Lanternfall's
"telegraphs not shortened below 250 ms", with our floors).

### 4.2 Exemptions

- **Chip hits** (≤ 5% RH) are exempt: swarm death pops, void-zone ticks, basic melee swings (their
  telegraph is the body's wind-up pose, 0.4–0.8 s).
- **Void zones** are not "hits": their rule is a **warm-up** (rim only, no damage) before the first tick:
  ≥ **0.5 s** when placed away from players, ≥ **1.0 s** when placed under or on a player. The first tick is
  never on the frame you enter; ticks are every 0.5 s.
- **Unavoidable room-wide pulses** are exempt from "leave" but still get a **1.5 s** "Brace!" banner so
  players can use defensive spells.

### 4.3 Warning time is also a reading budget

- A single mechanic's text on the banner is ≤ 6 words ("Soak — 3 needed").
- Never more than **3 distinct new telegraphs** start inside any **2.0 s** window (N) / 1.5 s (C).
- The **boss timers** helper (`set.interface.boss_timers`, default **on** on every difficulty (W16),
  page 04) shows a small bar per upcoming *known* big mechanic with its countdown, under the boss frame.
  It shows only mechanics the character has **seen before** on that boss (learned, not spoiled).

---

## 5. Shapes

Every shape can be drawn in any colour; the colour sets the rule. All sizes are in metres on the ground.
"Fill direction" is how the telegraph shows time running out.

| Shape | Parameters | Fill direction | Drawn with (reuse `spellfx.js`) | Notes |
|---|---|---|---|---|
| **circle** | radius r (1–20 m) | edge → centre | `decal` + `ring` | the default |
| **donut** | inner r1 (safe hole), outer r2 | outer edge → inner edge | two `ring`s + masked `decal` | the hole is drawn **clear** with a thin blue safe ring inside it |
| **cone** | length L, angle θ (30–180°), origin, facing | arc edge → apex | fan `decal` | facing locks at 50% of the warning (the boss commits) — dodge after it locks |
| **line / beam** | length L, width w, origin, angle | far end → origin, and both long edges → centre line | `beam` flattened / quad | a beam that **rotates** is a void zone (persistent), a line that hits once is red |
| **cross** | arm length L, width w, 2 lines at 90° | as line | two lines | may rotate between casts (45° steps) |
| **moving wave** | band depth d, width across the room, speed v (m/s), gaps | the band itself is solid red; gaps are cut out and outlined blue | `ring` or band quad | the wave is shown **1.5–3.0 s** before it moves, as an outline with its gaps; then travels at v ≤ 8 m/s so a walking player can reach a gap |
| **checkerboard** | tile size t (4–8 m), grid, which colour first | whole tiles fill edge-in together | tile decals | always alternates: the tiles that hit next are shown while the current ones resolve; no tile hits twice in a row |
| **room-wide** | the arena | a red ring races out from the source over the warning | `ring` large | always paired with a **blue safe zone**, a **LoS** cover (§21) or "Brace!" (unavoidable) |
| **ring (thin)** | radius r, width w | as circle | `ring` | a **fixed**-radius band; Wildmarch has no jump-over rings (there is no jump in combat). An expanding ring is a moving wave with one gap (`mech_shockwave_ring`) |
| **rectangle** | length, width, rotation | long edges → centre | quad decal | used for "the left half of the room" |
| **arc** | radius band r1–r2 + angle | as donut sector | masked decal | a sweep in front of the boss |
| **chevron path** | a polyline from the boss to its target | far end → boss | arrow decals | a charge; the path may bend once at a telegraphed point |
| **follow circle** | radius, speed | clock wipe | targeted (yellow) only | moves with the player until it locks (last 0.5 s it stops following) |

### 5.1 Shape rules

- A telegraph is **never smaller than the damage** it draws (hitbox = drawing, exact). The server tests the
  same shape it sent the client (page 16).
- A player is "inside" when their **feet centre** is inside. A player straddling the edge at the hit is
  **outside** (benefit of the doubt).
- Cones and lines that follow a target **lock** at 50% of the warning for N, 60% for C.
- Ground telegraphs **follow the terrain** (projected onto the ground, as Farhold's bridge-deck rule reads
  the walkable surface, reuse: Farhold `js/ground.js`), so a telegraph on a slope is drawn on the slope.
- On stairs and bridges the telegraph is drawn on the walkable surface you would be standing on, never on the
  river bed under a bridge (the Farhold water/ground lesson: draw what you measure, measure what you draw).

---

## 6. Sounds

Every telegraph has a sound that starts when it appears, is **panned** to its source (`sfx.play(id, { pan })`),
and is loudness-normalized in the `sfx` bus at the `ui` target (reuse: `sfx/js/loudness.js`). New catalog ids
for `sfx/data/catalog.json` (page 17 owns the recipes):

| Sound id | Played when | Recipe idea (synth method) |
|---|---|---|
| `tg_danger` | a danger zone appears | two-tone swell rising a fifth over the warning time; ends on a sharp click at the hit |
| `tg_danger_lethal` | a lethal danger zone appears | as above + a low bell toll at start and a heartbeat in the last 1.0 s |
| `tg_void_place` | a void zone lands | hiss + wet thud |
| `tg_void_in` | loop while the player is inside a void | low bubbling, 2 Hz, only for that player |
| `tg_soak` | a soak appears | three low drum hits |
| `tg_soak_pip` | a pip fills / empties | soft bell up / down |
| `tg_safe` | a safe zone appears | bright chime; pad sustains until the cast ends |
| `tg_target_you` | you are targeted | sharp ping + short voice "You!" (narrator) |
| `tg_target_other` | someone else is targeted | soft ping |
| `tg_benefit` | a beneficial zone appears | harp glide up |
| `tg_tether` | a tether forms (loop while it exists) | taut string hum; pitch rises with stretch |
| `tg_tether_snap` | tether breaks | string snap |
| `tg_cast_interruptible` | an interruptible cast starts | metallic "ting" (only if you have an interrupt ready) |
| `tg_interrupt_ok` / `tg_interrupt_fail` | kick lands / cast completes | glass crack / low buzz |
| `tg_adds` | adds are about to arrive | horn call from the spawn point's direction |
| `tg_enrage` | enrage begins | deep roar + a clock-tick loop |
| `tg_phase` | a phase transition starts | cymbal swell + music stinger |
| `tg_dialog` | a dialog opportunity opens | two gentle chimes |
| `tg_fixate` | you are fixated | heartbeat loop for the fixated player |

**Sound rules.** (1) At most **4 telegraph sounds** play at once; priority lethal > personal > soak/safe >
danger > others. (2) A sound never replaces a visual; a visual never replaces a sound — both, always.
(3) Boss voice lines (§9) duck the music by 6 dB, never the telegraph sounds.

---

## 7. The boss frame and the cast bar

Screen element `hud_boss_frame` (page 03 lists it in the HUD layout). Top centre, 520 px wide at 1080p.

```
 ┌──────────────────────────────────────────────────────────────┐
 │ ☠ The Kingsfire Warmarshal        Lv 60   ◆Boss   ⏱ 6:42 ⚡ │  name · level · rank · hard-enrage clock · soft-enrage icon
 │ ████████████████████▒▒▒▒▒▒░░░░░░░░░░░│░░░░░░░░│░░░░  62%   │  health; notches at phase thresholds; absorb shield in pale gold
 │ ▓▓▓▓▓▓▓▓░░░░░░░░ BREAK                                        │  break bar (§12)
 │ [Sunder ×2] [Wrath ×3] [Shielded]          → Tank: Brannoc    │  boss buffs (with stacks) · target-of-target
 ├──────────────────────────────────────────────────────────────┤
 │  ▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌░░░░░░░░  Call the Legion 1.2s │  CAST BAR
 └──────────────────────────────────────────────────────────────┘
   ▸ Headtaker in 8s   ▸ Firewall in 14s        (boss timers, §4.3)
```

| Part | Detail |
|---|---|
| Name, level, rank icon | skull for boss, crown for named rare, wreath for elite; level shows "??" if the boss is ≥ 10 levels above you |
| Health bar | exact %, with a **notch** at every phase threshold and the phase name on hover; absorbs drawn as a pale gold overlay; an **immune** boss greys the bar with a lock icon |
| Hard-enrage clock | shown from the pull when the content has a hard enrage (§13); turns red in the last 60 s |
| Soft-enrage icon ⚡ | appears when soft enrage starts; stack count on it |
| Break bar | §12 |
| Boss buffs row | icons with stack counts; the ones a player can **dispel/steal** have a blue border (§15) |
| Target-of-target | who the boss is attacking; flashes when it changes; hidden in the open world for non-bosses |
| Threat % | your threat as % of the tank's (page 05; shown for tanks always, others at > 80%) |
| Multiple bosses | up to **4 frames** stacked (councils); the focused one is full size, others compact (health + cast bar only) |
| Adds | the **add tracker** below the frames: one row per add type with count and a mini bar (§14) |

### 7.1 The cast bar

| Look | Meaning |
|---|---|
| **grey** bar, no border | cannot be interrupted |
| **grey** bar, **gold border** | interruptible (00 brief) |
| gold border **pulsing + red label "MUST INTERRUPT"** | interruptible, and completing it is severe or lethal (§12) |
| grey bar with a **lock icon** | temporarily immune to interrupts (the boss's "unbreakable" window) |
| bar fills **right-to-left** | a **channel** (it keeps doing something until the bar empties); interruptible channels are gold-bordered too |
| bar flashes **white** + "INTERRUPTED" | kicked; the spell name greys; a 4 s lockout icon shows on the frame |
| bar flashes **red** + spell name | completed |
| **cracked-shield** icon at the bar's right end | **unblockable**: shield blocks and block charges do nothing against this hit (a dodge or leaving the shape still works) |
| **crossed-swords** icon at the bar's right end | **unparryable**: a parry does nothing against this hit |
| **⟫** icon | **unstoppable**: cannot be paused, redirected or reduced by class tools (§12.3) |

The cast bar shows the **spell name** (≤ 22 characters), the remaining seconds (one decimal), and the
**telegraph colour** as a small square at its left edge (so "red square = danger zone coming").
Trash and elites show the same cast bar on their **nameplate** (page 03).

---

### 7.2 World markers in a fight

The eight **world markers** stay (00 §12.1 W16/W23): **Sword, Shield, Anvil, Crown, Leaf, Wave, Key, Eye**.
Any party member may place one on a body or on the ground (page 02 owns the keys, page 03 the marker bar).

| Rule | Value |
|---|---|
| On a body | the icon floats 0.5 m over its nameplate; it follows the body until it dies or the marker is moved |
| On the ground | the icon stands on a small **neutral grey** disc 1 m across, never filled in a telegraph colour, so it can never be read as a zone |
| Draw order | markers draw **above** telegraphs and are never hidden by them |
| Common use (a convention, not a rule) | Sword = kill first, Shield = the tank's target, Crown = interrupt this, Eye = crowd-control this, Key / Leaf / Wave / Anvil = spots to stand (soak spots, spread spots, the kiting loop) |
| Followers | read the Sword (focus), Crown (interrupt) and Eye (control) markers; a ground marker placed with **Follower command → Stand here** (page 02) sends a follower there |
| Limits | one of each icon per party; placed markers clear when the party leaves the dungeon |

## 8. The centre-screen warning banner

Element `hud_warning_banner`. Upper centre at 22% of screen height, max width 60% of the screen, 28 px
text (normal size), an icon at the left, a coloured stripe on the left edge in the telegraph colour.

| Kind | Look | Example text | Shown | Duration |
|---|---|---|---|---|
| `personal` | yellow stripe, larger, shakes once | "YOU are targeted — spread!" | only to that player | until the mechanic resolves |
| `lethal` | red stripe, red screen-edge pulse (setting) | "Get to the blue!" | everyone | until it resolves |
| `mechanic` | stripe in the telegraph colour | "Soak — 3 needed" · "Adds incoming (west door)" | everyone | 3.0 s or until it resolves |
| `boss_say` | no stripe, speaker name in gold, line in quotes, italic | **The Warmarshal:** "Burn the line!" | everyone in 60 m | voice length + 1.0 s |
| `phase` | wide banner, gold | "Phase 2 — The Brand Awakens" | everyone | 2.5 s |
| `enrage` | red, stays at the bottom of the stack | "The Warmarshal enrages!" | everyone | 4.0 s |
| `dialog` | teal | "The Warmarshal will hear you — answer?" | everyone | until the choice closes (§10) |
| `brace` | red outline only | "Brace!" | everyone | the warning time |

**Stacking rules.** At most **2** banners on screen; a third waits. Priority: `personal`+lethal > `lethal` >
`personal` > `mechanic` > `phase` > `enrage` > `boss_say` > `dialog`. A `boss_say` that **is** a warning
(§9) is shown as `mechanic` kind with the quote below the instruction. The same banner text is never shown
twice within 4 s. All banner text also goes to the chat log's **Combat** tab (page 03).

---

## 9. Boss dialog: lines that warn

Bosses speak: a **voice** (formant, reuse `shared/voices.js` with a timbre per boss, page 17), a **bubble**
over the head (reuse: speech bubbles), a `boss_say` **banner**, and a line in the chat log. Dialog line ids:
`bl_<bossid>_<key>` (e.g. `bl_b_kingsfire_warmarshal_open`). Lingo (reuse: `lingo/`) supplies variety for
repeated pulls: each key may have 1–4 variants and anti-repeat.

### 9.1 Line keys every boss has

| Key | When |
|---|---|
| `open` | on pull |
| `phase_<n>` | at each phase transition |
| `<mechanic>` | a **warning line** tied to a mechanic (below) |
| `kill_player` | a player dies (≤ once per 10 s) |
| `low` | at 10% health |
| `enrage` | at soft or hard enrage |
| `wipe` | the group wipes (gloat) |
| `death` | on death |
| `retry_open` | pull 2+ within 30 min (Lingo pool, reuse Emberveil retry openers idea) |

### 9.2 Lines that ARE the warning

A mechanic may carry `say: "bl_<boss>_<key>"` with a **lead** in seconds. Rules:

1. The line **starts at or before** the telegraph appears (lead 0–1.0 s) — so a player who knows the boss
   can react to the voice alone. Example: "The tide answers me!" = a moving wave in 3 s.
2. The line **never replaces** the visual and the sound. A muted player loses nothing.
3. The line is **consistent**: the same words always mean the same mechanic for that boss (Lingo variants are
   allowed only for non-warning keys). The first time a character hears a warning line, the banner shows the
   instruction under it ("…wave coming — find a gap").
4. Lines are ≤ 8 words for warnings, ≤ 20 for flavour.
5. Two warning lines never overlap; a second warning line waits and the visual goes ahead on time.

### 9.3 Examples (illustrative; page 12/13 own the real lines)

| Boss (page 10 warlords) | Line | Mechanic it announces |
|---|---|---|
| `b_ashtusk_overchief` | "Your head on my pole!" | `mech_headtaker` tank buster, 2.5 s |
| `b_ashtusk_overchief` | "Burn it all!" | `mech_fire_ring_closing` |
| `b_unburied_gravemarshal` | "Forward, my dead!" | `mech_marching_wave` |
| `b_stonehide_peakking` | "Fly, little thing." | `mech_hurl_player` on the targeted player |
| `b_kingsfire_warmarshal` | "The Legion answers!" | `mech_add_wave` at 60% and 30% |

---

## 10. Dialog opportunities: the boss asks, a player answers

Some bosses **pause** and offer the group a choice: parley, bargain, taunt, answer a riddle, plead for a
prisoner, swear an oath. The answer changes the fight, skips a phase, or unlocks a secret boss (00 brief).

### 10.1 What the player sees

Element `hud_dialog_choice` (page 03). A teal panel above the action bar, centred:

```
 ┌────────────────────────────────────────────────────────────┐
 │  THE GRAVEMARSHAL lowers its blade.                        │
 │  "You fight like the ones we buried. Why do you march?"    │
 │                                                            │
 │  [1] "For the living."           (Honour)                  │
 │  [2] "For your crown."           (Greed)                   │
 │  [3] "To end you." ⚔             (Defiance)                │
 │                                                            │
 │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  9.2 s     Votes: 1 ▮▮  2 ▮  3 —      │
 └────────────────────────────────────────────────────────────┘
```

- 2–4 replies. Each shows its **tone tag** (Honour, Greed, Defiance, Mercy, Cunning, Truth) — never the
  outcome. A ⚔ marks a reply that restarts the fight at once.
- Keys: **Alt+1 … Alt+4** (so the action bar 1–6 still works), mouse click, gamepad D-pad + A (page 02 owns
  the binding; proposed id `key.dialog_choice_1..4`).
- **Timer**: 10 s default (8–15 s per opportunity). A bar empties; last 3 s it pulses.
- Sound `tg_dialog`; banner kind `dialog`; the boss's line is voiced.

### 10.2 The pause ("parley state")

While the panel is open:
- the boss stops attacking and casting, becomes **immune**, and turns to face the group;
- adds stop where they are; **existing danger zones resolve** as normal (no new ones), **void zones stop
  ticking** (they stay drawn, dimmed 50%);
- players can move, heal, drink and swap gear, but **any damage to the boss or an add** counts as choosing
  the ⚔ reply (or, if none, as silence);
- the hard-enrage clock **pauses** (talking never costs a group its enrage time).

### 10.3 Who chooses

| Group | Rule |
|---|---|
| **Solo** or **solo + followers** | you choose; followers never vote |
| **Party / dungeon (2–5 players, followers fill the rest)** | every **player** votes (followers never do). The panel shows live counts, and a player may change their vote until the panel closes. It closes early when one reply has **more than half** of the players present: 2 of 2, 2 of 3, 3 of 4, **3 of 5**. At the timer: the reply with the most votes wins; a tie goes to the **party leader's** vote if the leader voted for one of the tied replies, else to the tied reply that was **voted first** |
| **Open world (world boss)** | no votes (too many strangers): dialog opportunities are **not used** at world bosses; they only speak lines (§22.4). A warlord uses one only inside its **camp keep**, which is a party instance (the party rule above) |

A player who is dead can still vote (they are watching). A disconnected player's vote is not counted.

### 10.4 No answer (silence)

Every opportunity defines `onSilence`. The rules:
- Silence **never** unlocks a secret, a skipped phase or extra loot.
- On **Normal**, silence continues the fight exactly as if there had been no opportunity (the "default" path).
- On **Challenge**, silence may take the **harsher** branch if the boss's text makes that obvious
  ("Silence? Then you are nothing." — boss +10% damage for the rest of the fight).
- The chat log records "The group said nothing."

### 10.5 Outcome kinds

| Kind | What it does | Example |
|---|---|---|
| `skip_phase` | the next phase is skipped (its health is removed; its loot is not) | the boss accepts a parley and sends away its guards |
| `branch` | the next phase uses a **different** mechanic set | answering with Defiance brings the fire phase, Mercy the water phase |
| `buff_group` | the group gets a buff for the fight | "Oath of the Living": +10% healing received |
| `debuff_boss` | the boss is weakened | it "remembers its name": −15% damage |
| `cost` | the group pays: gold from each player (≤ 1% of a level-appropriate purse), an item handed over, or 20% max health for the fight | a bargain |
| `taunt` | boss +20% damage **and** +1 loot roll for the group | a dare |
| `secret` | unlocks a **secret boss** after the kill (or replaces this boss) | the riddle answered right |
| `story` | a flag for the story or reputation (page 14/07) | spare the prisoner; the prisoner appears in town later |
| `end` | the fight ends peacefully — counts as a kill for loot (and, on Challenge, for the weekly loot limit); rare, and only on Normal-difficulty story bosses | |

### 10.6 Rules

1. At most **2** opportunities per boss fight, never in the last 10% of health, never during a lethal
   telegraph.
2. An opportunity appears **every pull** (a wipe does not use it up). A `secret` or `end` outcome pays **once
   per run** on Normal and **once per week** on Challenge (the Challenge loot limit, 00 §4, Monday 06:00).
3. Riddle answers come from a **pool of 3 riddles** per boss, picked per pull, so reading still matters.
4. The best-for-loot answer is never the obviously polite one every time — answers are balanced so each tone
   has at least one boss where it is right.
5. At Depth an opportunity works exactly as on the difficulty the run uses (there is no timer, 00 §12.1 W3).
6. All replies and outcomes are **data** (`dialog` block, §27) so page 12/13 write them without code.

### 10.7 Examples

| Where (illustrative) | Line | Replies → outcomes | Silence |
|---|---|---|---|
| `b_unburied_gravemarshal` (warlord, used only inside its **camp keep** — a party instance, so votes work) at 50% | "Why do you march?" | *Honour* "For the living." → `debuff_boss` −15% damage (it hesitates) · *Greed* "For your crown." → `taunt` · *Defiance* ⚔ "To end you." → fight resumes at once with Vicious | fight resumes |
| A dungeon boss holding a prisoner (page 12) at 66% | "Take her, and leave my hall." | *Mercy* accept → `end` on Normal / `skip_phase` on Challenge; the prisoner is saved (`story`) · *Cunning* "And your treasury too." → `branch` to a harder gold-coated phase with `taunt` loot · *Defiance* ⚔ | Normal: default; Challenge: prisoner executed (`story` fail), boss +10% |
| A riddling guardian (page 12/13) at pull | "I have a mouth and never eat, a bed and never sleep." | three answers, one right ("A river") → `secret` door opens after the kill · wrong answers → `buff_group` none, boss says "Wrong." and fights | fights |
| A story boss in d15 or d16 (page 12) at 30% | "Swear to me, and I will spare the rest." | *Oath* (party vote) → `cost`: every player who voted Oath is cursed for the rest of the run (−5% damage, cosmetic chains) and the party skips the final phase · *Defiance* ⚔ | final phase as normal |
| A bargaining merchant-king | "Name your price." | *Greed* pay 50 gold each → `debuff_boss` (his guards leave: no adds) · *Truth* "Your guards are already ours." → `branch` (guards turn on him; needs a reputation flag) · *Defiance* ⚔ | adds as normal |
| A dying dragon (secret-boss gate) at 5% | "Let me see the sky once more." | *Mercy* → the dragon flies away (`end`); a secret boss (its mate) appears next week (`secret`) · *Defiance* → kill and normal loot | kill |

---

## 11. Phases, arena lock, transitions and resets

### 11.1 Phase triggers

| Trigger | Example |
|---|---|
| health % (the usual; reuse Farhold `phases[{ at }]`) | 70% / 40% / 15% |
| time | every 90 s an intermission |
| adds killed | when all 4 wardens die the shield drops |
| event | a puzzle solved, a lever pulled, a dialog outcome |

### 11.2 Transitions

- A transition lasts **1.5–4.0 s**; the boss is **immune** and does not attack.
- All pending **danger zones resolve** on time; no **new** telegraph starts during a transition.
- **Void zones fade out over 1.0 s** unless marked `persist: true` (then they stay into the next phase, and
  the phase is designed around them).
- **Tank-handoff (Sunder) stacks** reset to 0.
- The `phase` banner, sound `tg_phase`, a music stinger, and the boss's `phase_<n>` line.
- Solo + followers on Normal: the player and followers get **15% max health back** at each transition
  (a breather; groups rely on their healer).
- If the arena changes (floor collapses, water rises), the change **happens during** the transition and its
  new hazard shows its telegraph before the next phase starts.

### 11.3 Intermissions

A phase where the boss is **untargetable** and the group deals with adds, a puzzle or a moving hazard.
Maximum **45 s**; a visible countdown on the boss frame; ends early when its task is done.

### 11.4 Arena lock

Entering a boss's arena and damaging it **closes** the arena (a door, a wall of fire, rising water, thorns —
drawn in the dungeon's own material, never a red ground colour). Players outside are locked out until the
fight ends; a player who joins late (disconnect) is placed at the entrance, inside. Bosses **never leave**
their arena; a boss pulled past its arena edge **evades** (page 10 §5.4) and resets.

### 11.5 Resets

- **Wipe** (every player dead, or every player outside the arena) → the boss resets at once to full health
  and phase 1, adds despawn, zones clear, the door opens after 5 s.
- **Soft reset** for a boss that is kited out of reach for 10 s: evade and reset.
- The boss's `wipe` line plays; the `retry_open` line on the next pull.
- Cooldowns over 3 minutes and the hard-enrage clock reset. There is **no limit on in-combat revives**
  (00 §12.1 W21), so there are no revive charges to reset (page 05 owns revives).

---

## 12. Interrupts, crowd control and the break bar

### 12.1 Interrupts

- **Gold border** = interruptible (§7.1). An interrupt cancels the cast and **locks** that spell for **4 s**
  (no other school lockout on bosses).
- A boss has at most **one interruptible important cast every 8 s** on Normal (so a single interrupter can
  cover it), every 5 s on Challenge (a rotation of two).
- **MUST INTERRUPT** casts: completing them is severe or lethal. Every one of them has a **second answer**
  so that a group or solo player without an interrupt can still win:
  - **Break its focus**: dealing **10% of the boss's max health during the cast** (N; 15% C) cancels it; or
  - **Line of sight**: the cast needs to see its target; hiding behind cover (§21) makes it fail; or
  - **Stun a caster add** (adds, not bosses, can be stunned).
- The party frame shows each member's interrupt cooldown (page 03). A group may set an **interrupt order**
  (party frame right-click → "Kick order 1…5"); the next person in order gets a gold outline on their
  interrupt button when an interruptible cast starts.
- Unbreakable windows: some casts show a **lock icon** — cannot be interrupted, and say so.

### 12.2 Crowd control on bosses: the break bar

**Canon (00 §10): bosses ignore stun, knockdown, root and disarm; control fills a break bar instead.** Bosses
(warlords included) also ignore fear, sleep and charm, and take knockbacks at ×0.25 distance (page 05 §11.1).
Elites, champions and named rares are **not** bosses: they take crowd control with page 05's caps and
diminishing returns. Instead, every crowd-control effect and every hit of ≥ 3% of their health adds to a **break bar** under the
boss frame (reuse: Farhold `js/combat-feel.js` stagger with diminishing returns):

| Thing | Break added |
|---|---|
| stun / sleep / fear / charm attempt | 12% of the bar |
| root / slow / knock | 6% |
| a hit ≥ 3% of the boss's health | 4% |
| an interrupt | 10% |

- The bar drains 5% per second when nothing adds to it.
- When **full**: the boss is **Broken** for 4 s — it stops, cancels any cast (except lethal ones already
  shown, which resolve), and takes **+25% damage**. Then it is **immune to break** for 30 s (bar greyed).
- Some bosses **need** a break to stop a mechanic ("break its guard before the channel ends") — the bar gets
  a gold outline while that is true.
- Normal monsters are not bosses: they take crowd control normally (page 05) with diminishing returns.

### 12.3 Class tools against boss mechanics (reconciliation rules, 00 §10)

Class pages lean on these rules; this page owns them.

**Hit and status flags.** Every boss ability and every status it applies may carry these flags in its data
(`flags: [...]`, §27). Class tools read them:

| Flag | Meaning | What it stops |
|---|---|---|
| `mechanic` | the hit or status **is** the fight's mechanic (a soak share, a Targeted circle, a doom debuff, a stack, a purge-proof boss buff) | redirection, interception, grounding, sharing, purging and "absorb it for an ally" tools (for example the Knight's Vow of Protection; class pages name the rest). A tool may still **reduce** it unless it is also `unavoidable` |
| `unavoidable` | room-wide damage the healers are meant to heal (a "Brace!" pulse, §3.1 rule 6) | every tool that negates or cheats it: circles that cancel damage, "cannot drop below 1 health", damage moved to another body. Ordinary damage reduction still applies |
| `unstoppable` | a cast or knockback that cannot be paused, interrupted, broken or resisted (⟫ icon) | cast-pause tools (below), knockback immunity (§19), the break bar's cast cancel |

A tank buster with no flag is a normal hit and every class tool works on it. Page 12/13 authors set the flags;
a test fails if a `soak`, `targeted` or `brace_pulse` mechanic is missing its `mechanic` / `unavoidable` flag.

**Shared cast-pause lockout.** Every class tool that **pauses** a boss cast (Chronomancer Chrono-lock and any
other "freeze the cast bar" effect) shares **one 90 s lockout per boss**: after any player pauses a cast, no
one can pause that boss's casts again for 90 s. The boss frame shows a small hourglass with the countdown.
Casts flagged `unstoppable` are never paused. Interrupts (§12.1) are not pauses and do not use this lockout.

**Pets and bodies.** Class companions and deployables (the Ranger's tamed beast, the Warlock's bound demon, the
Necromancer's controlled undead, the Enchanter's charmed creature, the Tinker's sentry…) **take no party slot**, **leave a danger zone 0.6 s after it appears**, **leave a void zone
after 0.5 s in one**, **never count toward a soak**, and take **25% damage from room-wide hits**. **Followers
are different**: a follower takes a party slot, counts toward soaks and takes full mechanic damage (§23).

**Immune players and soaks.** A player who is immune to damage at the moment a soak lands (a roll's i-frames,
Knife Tumble, a class immunity) **still counts toward the pips** but takes **no damage**; the split is
worked out over everyone counted, so the immune player's share is simply not dealt.

**Charmed creatures at the arena door.** A creature an Enchanter has charmed cannot enter a dungeon
boss arena once the boss is pulled: it **waits outside** at the arena wall (§11.4) until the fight ends or the
charm breaks ([classes/enchanter.md](classes/enchanter.md) §2.2).

**"No shapes" phases.** A boss phase may carry `noShapes: true` (a silence room, a binding circle). While it is
on, shapeshift forms cannot be entered and anyone in a form is returned to caster form at the phase start; the
Druid's Form Ring shows a red slash ([classes/druid.md](classes/druid.md)). Page 12/13 list which phases use it.

---

## 13. Enrage (soft and hard)

Each boss has a designer **target time** T (the kill time for a competent group in expected gear, page 12/13
set T per boss).

| Content | Soft enrage | Hard enrage |
|---|---|---|
| Dungeon **Normal** | at 2.0 × T: **Wrath** stacks: +10% damage every 30 s | none |
| Dungeon Normal, solo + followers | at 2.5 × T: Wrath | none |
| Dungeon **Challenge** | at 1.5 × T: Wrath | at 2.0 × T |
| Dungeon at **Depth** | as the difficulty the run uses, with T set per depth by page 12 (deeper runs expect a faster kill) | as that difficulty |
| Open world (elite, named rare, warlord, rarity monsters) | none; the leash and evade handle kiting | none |
| World boss | page 13 (usually a despawn timer, 15 min) | none |

**Soft enrage** kinds (the boss picks one, stated on page 12/13):
- **Wrath** — +10% damage and +5% attack speed every 30 s (stack icon on the boss frame).
- **Shrinking arena** — the arena edge becomes a void zone growing inward 1 m every 10 s.
- **Flood** — a void zone fills the low ground, rising in steps.
- **Tide of adds** — add waves double in size every minute.

**Hard enrage**: a 10 s cast **"<Boss>'s Final …"** with the red **MUST INTERRUPT**-style label but a lock icon
(it cannot be stopped), a room-wide red ring, banner "Enrage — it will kill everyone", the `enrage` line. At
the end: 999% RH to everyone. The hard-enrage clock is on the boss frame **from the pull**, so it is never a
surprise.

---

## 14. Adds

"Adds" are extra monsters a boss brings in. Types (each has an icon on its nameplate and in the add tracker):

| Type | Icon | Job | Typical HP (× boss's MH level curve) | What players do |
|---|---|---|---|---|
| **swarm** | dots | many weak bodies | 0.3 each | area spells |
| **bruiser** | fist | hits the healer or the tank | 1.5–2.5 | tank picks it up |
| **caster** | star | interruptible casts, often a heal on the boss | 0.8 | interrupt / kill first |
| **shield-bearer** | shield | makes the boss immune while alive (a white tether from add to boss) | 1.5 | kill to drop the shield |
| **bomber** | flame | walks to a player and explodes (red circle 5 m, 2.0 s, 40% RH) | 0.4 | kill or kite away |
| **fixater** | eye | chases one player (§21) | 0.8 | kite; slow it |
| **soaker** | drop | must be killed **inside** a zone or it explodes at the boss's feet | 1.0 | drag it to the zone |
| **priority** | red skull (auto-marked) | must die within a timer or something bad happens | 1.0–3.0 | switch |
| **totem / object** | pillar | a thing, not a creature: cannot move, often empowers the boss | 0.5–2.0 | destroy |

**Rules.**
- Adds are announced: a spawn point **glows 2.0 s** before they appear (door rune, ground crack, portal), the
  horn sound `tg_adds` from that direction, banner "Adds incoming (east)".
- Adds **never spawn within 6 m of a player** and never inside a danger or void zone.
- Adds join the **threat table** normally (page 10 §5.6) unless they are fixaters.
- The **add tracker** under the boss frame shows each add type, how many are alive, and a mini health bar
  for priority adds.
- Priority adds get a **red skull on their nameplate** automatically. That skull is not one of the eight
  world markers (§7.2), which only players place.
- A boss's add waves are capped: **8 bodies** alive at once in a dungeon (swarm counts 0.25 each); world
  bosses use §22.4.

---

## 15. Dispels

Page 05 owns the status list. Mechanics mark each harmful effect with a **dispel type**:

| Dispel type | Icon border | Who removes it (classes, page 06) |
|---|---|---|
| `magic` | blue | cleric, priest, paladin, oracle, enchanter, shaman… |
| `curse` | purple | druid, witch hunter, shaman… |
| `poison` | green | druid, monk, ranger… |
| `blight` (disease) | olive | cleric, paladin, priest… |
| `none` | grey | cannot be removed; wait it out or use the mechanic's own answer |

(Class lists are illustrative; page 06 owns which spell removes what.)

**Dispel mechanics** (all telegraphed on the debuff itself):
- **Plain**: remove it or it keeps hurting.
- **Punish on dispel** (`dispel: "punish"`): the icon has a **red rim** and the tooltip says what happens;
  dispelling it causes a red circle **on the target** (3–8 m, 1.5 s) — the target must step away from others
  first. The banner on application says "Step away before dispel".
- **Jump** (`dispel: "jump"`): dispelling moves it to the nearest other player (a white arc shows where).
- **Stack-gated**: can only be dispelled below N stacks (icon greys above).
- **Boss buffs** marked with a blue border can be **purged** (dispel/steal, page 06) — e.g. a boss's damage
  shield.
- Solo fairness: every dispel-required mechanic in **Normal** content also ends on its own within 12 s,
  or can be cleared by a **green beneficial zone** the boss drops, so a class without a dispel can finish it.

---

## 16. Tank handoffs (was: tank swaps)

A five-player party has **one** tank, so the raid-style "two tanks trade the boss" rule is gone. It is
replaced by a **tank handoff**: a stacking debuff that the tank must answer, with three answers so every party
shape can deal with it — and the first answer is where the **hybrid** classes shine (00 §6, W7).

- The boss's melee applies **Sunder** (`mech_sundering_blow`): +12% damage taken from the boss's melee per
  stack, 20 s, refreshes on each hit. At **4** stacks (Normal) / **3** (Challenge) the next hit is **severe**.
- **Answer 1 — Handoff.** Anyone with a taunt (the shared **Provoke** or a class taunt: a hybrid-tank Mage, Warlock, Fighter, Swashbuckler, Shadow
  Dancer, Enchanter, Tactician, a Druid in Bear form, a Dragon Knight, a Runesmith… or a tank follower) taunts
  and holds the boss for **6 s**; while the tank is not being hit, its stacks fall off 1 per 1.5 s. Taunting
  during a tank buster makes the buster hit the new target — shown on the cast bar ("Headtaker → Brannoc").
- **Answer 2 — Brace.** The tank uses a major defensive (≥ 40% damage reduction, page 05 marks which) so it
  is active when the threshold hit lands: that hit consumes every stack.
- **Answer 3 — Cleanse.** The boss drops a green **Cleansing Pool** (`mech_cleanse_pool`) every **30 s**
  (Normal) / **45 s** (Challenge) at the arena edge; the tank stepping in clears 1 stack per 1 s (the boss
  follows the tank, so the pool is always reachable).
- **Normal** caps stacks at threshold − 1 (the hit is never severe), so the answers only make the fight
  smoother. **Challenge** keeps the full rule.
- The debuff icon on the party frames shows the stack count **in big numbers** and turns red at the threshold;
  the tank gets a `personal` banner "Handoff! (4 stacks)"; the player who last taunted it gets a Shield-marker
  outline on their taunt button (§7.2 convention).
- **Taunt immunity**: a boss cannot be taunted twice within 3 s (stops ping-pong mistakes).
- Followers: a tank follower answers with Brace or Cleanse; a hybrid follower with a taunt takes the handoff
  on its own at the threshold (§23).

## 17. Tethers

A **white** line between two bodies (player–player, player–boss, boss–add). The tether's **rule** is shown
by an icon at its midpoint and in the banner:

| Rule | Midpoint icon | What happens | HUD |
|---|---|---|---|
| **break** (`mech_tether_break`) | scissors | while linked, both take 3% RH per 0.5 s; runs **> L m** apart (L shown in the banner, e.g. 15 m) → snaps | distance readout "12 / 15 m" on both frames |
| **keep** (`mech_tether_keep`) | knot | must stay **within L m**; stretching past L snaps it for 40% RH to both | readout turns amber at 80% of L, red at 95% |
| **share** (`mech_tether_share`) | balance scales | damage to one is split with the other; pick partners with similar health | — |
| **intercept** (`mech_beam_intercept`) | shield | a beam from boss to a target; any other player stepping into it takes the hit instead (and it moves to them) | beam drawn white with a yellow target end |
| **anchor** (`mech_anchor_link`) | chain | boss is immune while an add is tethered to it; kill or pull the add 20 m away | shield icon on the boss frame |
| **cross** (`mech_tether_cross`) | X | two tethers must not cross; crossing → both snap for 30% RH | — |

**Tether rules.** (1) Tethers are drawn **above** ground zones, with beads moving toward the end that will be
hit. (2) The line colour stays white; a tether about to snap flashes amber (stretch) and plays a rising hum.
(3) Tethers never form on a dead player. (4) In solo + followers, player–player tethers form between the player
and a follower, and the follower moves to satisfy the rule (§23). (5) **White is for boss and monster tethers
only.** A tether drawn by a player's own spell is **gold** (§3.1 rule 8), so a gold line is never a mechanic.

---

## 18. Debuff stacks

- Stacks show as a **number on the icon** (personal debuff tray, party frame, above the player's head for
  others — "×4").
- Every stacking mechanic states: max stacks, per-stack effect, duration (refresh or independent), the
  **threshold** where it becomes dangerous, and **how to drop it** (wait, a green zone, a dispel, a handoff, an
  action like stepping into water).
- At the threshold the icon **pulses red** and the player gets a `personal` banner.
- Max stacks on any one mechanic: **10**. Max stacking mechanics running at once on one player: **2**.
- Group debuffs that **count up** for everyone (a room-wide "Chill" rising) show on a **group meter** under
  the boss frame instead of on each player.

---

## 19. Knockbacks and ledges

- A knockback is a **red** danger zone with **white arrows** in the fill: arrow direction = push direction,
  arrow length ∝ distance. Distance is written on the banner for severe ones ("Knockback 15 m").
- Knockback distance tiers: small 3 m, medium 8 m, large 15 m, launch 25 m (lands with a 1 s stagger).
- **Ledges** (the arena has an edge you can fall off):
  1. **No knockback toward a lethal ledge** with less than **3.0 s** warning (it is lethal).
  2. On **Normal** and in the open world, falling off an arena ledge is **not death**: 30%
     RH fall damage and you are placed back at the nearest arena edge after 2 s ("the fall returns you").
  3. On Challenge, a ledge can kill **only** if the mechanic is designed around it (the fight's page says
     so), and the ledge **glows** red at its lip while any knockback is being cast.
  4. Open-world knockbacks near cliffs are aimed **along** the ledge, never over it (page 10 Ridge Griffin,
     Peak-King throw). Farhold's cliff rule applies: slopes over 63° stop bodies (reuse: R27 M7).
  5. **Knockback immunity** effects work on every knockback except those marked **Unstoppable** (a ⟫ icon in
     the arrows); an Unstoppable knockback is never lethal.
- **Pulls** (toward the boss) use the same arrows pointing inward, with the same rules.

---

## 20. Environmental hazards

Hazards are part of the arena or the open world. They use the same colours when they hurt.

| id | Hazard | How it shows | Damage / effect | Counterplay |
|---|---|---|---|---|
| `mech_env_lava` | lava / molten slag | glowing surface; the **edge** where it meets walkable ground has a void-style violet rim when it is dangerous to touch | 8% RH per 0.5 s + burn; not lethal on touch | step out; some classes cross with fire resistance |
| `mech_env_rising_tide` | water rises in steps | the next water level is drawn as a **blue-dashed line** on the walls 5 s before; standing below it when it rises → `drowning` meter | drowning meter 10 s → 10% RH per s | climb to the marked high ground |
| `mech_env_current` | flowing water / wind lane | arrows on the surface; pushes 2–4 m/s | none (it moves you) | walk against it, use it |
| `mech_env_falling_rocks` | ceiling debris | **red circles** 2–3 m, 2.0 s, shadows grow under them | 20% RH + stun 1 s | leave the shadows |
| `mech_env_collapse` | floor tiles that fall | tiles **crack** with a red edge 3.0 s before falling; then gone (a hole) | falling = the ledge rule (§19) | stand on uncracked tiles |
| `mech_env_darkness` | **Gloom** (a boss-made gloom; the world itself is always daylight, and dark places are only dark-*looking*, 00 §4) | the arena dims to film-set dark: everything stays readable, but **monster nameplates beyond 8 m are hidden** and a thin grey fog sits at knee height | monsters in the gloom gain the Cloaked effect (page 10 `mod_cloaked`) | stand in the **green** brazier circles (beneficial: nameplates within 15 m show); some class spells reveal 12 m (page 06). No torch or lantern item is needed or exists |
| `mech_env_cold` | Chill meter (Frostmantle, frost bosses) | a group or personal meter 0–100 under the boss frame / above the action bar | at 50: −20% move; at 100: frozen 3 s then meter to 50 | stand in **green** warm zones (braziers, a class's fire) to drain 10 per s |
| `mech_env_heat` | heat (Sunscar, Kingsfire) | personal meter; rises in open sun / near lava | at 100: −30% healing received | shade zones (green) |
| `mech_env_poison_fog` | poison gas in low ground | green-grey fog volume with a **violet void rim** where it ends | 3% RH per 0.5 s | high ground |
| `mech_env_lightning_storm` | storm strikes | **red circles** 3 m, 2.0 s, on random players and on metal objects | 25% RH + shock | move; avoid standing near conductors |
| `mech_env_quicksand` | sinking sand | a sand patch with a slow swirl (not violet: it does not damage) | root after 3 s inside, 1.5 s | keep moving |
| `mech_env_ice_slick` | slippery ice | pale shine | movement slides (reduced turning) | short steps |
| `mech_env_wind_gust` | periodic gust across the arena | arrows sweep across 2.0 s before; pushes 10 m | none (can push into a zone) | brace (stand behind cover) |

Rules: environmental damage respects the same warning minimums as boss attacks; a hazard that can kill
(ledges, drowning) follows the lethal rules; hazards are **identical on every visit** (never random terrain in a
boss arena).

---

## 21. Line of sight, fixates, kiting, and facing / turn rates

### 21.1 Line of sight (LoS)

- A **LoS mechanic** is a cast that hits everyone the boss (or a totem) can **see** when it ends.
- The test: a line from the caster's eye to the player's chest; pillars, walls and marked **cover objects**
  block it; players and adds do not.
- While a LoS cast runs, the **shadow behind every cover object** is drawn as a **blue safe-zone wedge** on
  the ground (the only time blue is a wedge), so "hide behind the pillar" is always shown, not guessed.
- Cover can be **destroyed** by the cast (a pillar cracks and falls after absorbing it; the arena runs out of
  cover — that is often the soft enrage).
- **Gaze** variants (`mech_gaze`): it is **facing** that matters, not hiding: players facing the caster when
  the cast ends are affected. The telegraph is a large eye icon over the boss and a red vignette on the side of
  your screen that faces it; turning the camera away is enough.

### 21.2 Fixates

- A fixater add picks a player: a **yellow** targeted marker on the player, an **arrow** above the add pointing
  at them, a heartbeat for the fixated player, banner "<Add> is chasing you!".
- Fixaters **ignore threat and taunt**, move at **85%** of the target's run speed (N) / 95% (C), last 12 s
  or until the add dies, then pick a new target (never the same player twice in a row).
- Fixaters that catch their target do what the mechanic says (explode, stun, feed the boss).
- **Kiting** rule: an arena with fixaters always has a clear loop of ≥ 40 m circumference with no void zones
  placed on it by default.

### 21.3 Facing and turn rates (new; the rogue's blind spots read this)

A boss's body faces its **current target** (the top of its threat table, page 05 §13) and turns toward it at a
fixed **turn rate**. How fast it turns decides how long a flank or rear angle lasts when the target moves, so it
matters to the rogue's view cones and Blind Spots ([classes/rogue.md](classes/rogue.md) §2.1, §2.4: a boss's
cone is 150° wide, 40 m long), to backstab-style talents, to frontal cones and to tanks who hold a boss turned
away from the group. Ordinary monsters use the rogue file's family table; this table is for **bosses** (dungeon
sub-, main, end and secret bosses, warlords, named rares and world bosses).

| Boss size | Examples | Turn rate | A 180° turn takes |
|---|---|---|---|
| **Small** — human-sized: chibi ×1.0–1.6, creature up to ×2.4 | Pell the Lantern Thief, the Dunecutter bosses, most humanoid sub-bosses | **120°/s** | 1.5 s |
| **Medium** — chibi ×1.7–2.4, creature ×2.5–3.4 | the Kingsfire Warmarshal, Krunn on Razorback, Rimeweaver Seidra | **105°/s** | 1.7 s |
| **Large** — chibi ×2.5 and up, creature ×3.5 and up (titans, dragons, horrors, great beasts) | the Glass Wyrm, Oruvel, the Last Titan | **90°/s** | 2.0 s |
| **World boss** (any size) | the eight regional and the seasonal world bosses (page 13) | **90°/s** | 2.0 s |
| **Stationary** — rooted or built into the room (a tree-heart, a bell, an engine) | page 12 marks them (`turnRate: 0`) | **0°/s** — it never turns; its facing (if any) is scripted | — |

Rules:

- **During a cast** a boss does not turn (0°/s) unless the mechanic says it tracks: a cone locks its facing at
  50% of the warning (§5), a tracking beam uses its own rate (e.g. `mech_rotating_beam` 30–40°/s). After the
  cast it resumes its turn rate. This is the window a rogue's Blindside and a side-step both use.
- **Taunts and target changes** (Provoke, a class taunt, a fixate ending) do **not** snap the boss round: it
  turns at its rate, so a tank who taunts from behind the group still has to walk the boss round.
- **Charges, leaps and teleports** set the boss's facing to the direction of travel; it then turns normally.
- **Look Around**: a boss script may include a *Look Around* cast (grey cast bar, 2.0 s, its own banner "It is
  watching!"): the boss turns a full circle and **every blind spot is closed** while the bar runs. At most one
  every 30 s. Page 12 marks which bosses have one.
- **Challenge and Depth do not change turn rates** (a faster turn would silently delete a class's angle; harder
  content adds mechanics, not twitchiness). A page 12/13 boss entry may set its own `turnRate` inside the
  90–120°/s band, or 0 for a stationary boss; anything outside the band needs a line saying why.
- The **Elevated** rule of the rogue file stands: a flying boss or one flagged `sees_all` has no blind spot, and
  a world boss's 150° cone still leaves a 210° blind arc behind it.

---

## 22. Scaling: up to 5 players, solo + followers, the open world, world bosses, and rarity monsters

A dungeon has **five slots**. Each slot holds a player or a follower (00 §10: a follower takes a party slot);
a slot can also be empty if a group enters short. Mechanics count **living slots present at the moment of the
cast**, never who entered the instance. Nothing in a dungeon is sized for more than five.

### 22.1 Group content scaling table (dungeons, Normal and Challenge)

| Mechanic element | Solo + 4 followers | 2–4 players + followers (5 slots) | 5 players | Short group (empty slots) |
|---|---|---|---|---|
| Boss health | × 0.85 | × (1 − 0.0375 × followers): 3 followers 0.89, 1 follower 0.96 | × 1 | × (0.4 + 0.12 × filled slots): 4 slots 0.88, 3 slots 0.76, 2 slots 0.64 |
| Tanks expected | 1 (you or a follower) | 1 | 1 (+ a hybrid for handoffs, §16) | 1 |
| Healers expected | 1 (you or a follower) | 1 | 1 | 1 |
| **Targeted** circles per cast | 1 | 1 at ≤ 3 living slots, 2 at 4–5 | 1–2 (Challenge: 2) | 1 |
| **Soak** pips | 2 (followers fill; you may be one) | min(stated pips, living slots − 1), at least 1 | 2–3 (Challenge: 3) | as the middle column |
| Soak damage per soaker | total ÷ soakers | same | same | same |
| **Tethers** (pairs) | 1 (you + a follower) | 1 | 1 (Challenge: up to 2) | 1 if ≥ 2 slots, else none |
| **Adds** per wave | 1 fewer than the 5-player value (min 1) | base | base | −1 per 2 empty slots (min 1) |
| Debuff-stack threshold | +1 over the 5-player value | base | base | +1 |
| Void zones placed per cast | × 0.75 | × 0.9 | base | × 0.75 |
| Group-wide damage (`mech_brace_pulse`) | × 0.8 | × 0.9 | base | × 0.8 |
| Warning time | +0.3 s (Normal only) | +0.3 s if any follower is present (Normal only) | §4 | +0.3 s (Normal only) |

Soaks, targeted counts and tethers use the **living slots present** at the moment of the cast (a soak needing 3
with two players dead needs at most 2).

### 22.2 Challenge and Depth (on top of size)

- **Challenge** (every dungeon at level 60, 00 §8): the §4.1 Challenge floors; **+1 mechanic per boss** (page 12
  lists which); void zones last 25% longer; the §16 tank handoff at full strength; hybrids may be weaker here
  than in their primary role (00 §6), and every Challenge fight is still winnable with a pure-role party.
- **Depth** (page 12 owns every number): Depth adds health, damage, pack size and — at each **Depth tier** (every
  5 depths) — **more mechanics and more monsters**, never shorter warnings. The mechanic side, owned here:
  - **Tier 2+**: each boss gains **one** mechanic from its **Depth list** (page 12 names 2–3 per boss, all from
    the §26 library). **Tier 4+**: two. They are never lethal, never a second soak on top of an existing soak,
    and they obey §4.3's reading budget (at most 3 new telegraphs inside the window) — the boss script delays
    its own next mechanic rather than break the budget.
  - **Trash**: page 10 §7.9 gives each family its Depth abilities, Depth type and Depth warden, and the extra
    rarity slots per tier. Rarity monsters at Depth use §22.5.
  - Depth never adds a lethal mechanic to a boss that had none, and never removes a fairness rule of §25.

### 22.3 Open-world rarity monsters, elites, named rares and warlords (the lighter version)

| Rule | Champion pack / rare (page 10 §7.2–7.3) | Greater-rarity carrier (page 10 §7.5) | Named rare / elite | Warlord |
|---|---|---|---|---|
| Mechanics budget | 0–3 (one per mechanic affix) | its rank's + the greater's own (1–3); **at most 4 in total** | ≤ 3 (+ a fixed greater's) | ≤ 4 |
| Warning minimums | §4 open world (≥ 2.0 s) | same | same | same |
| Heaviest single hit | severe allowed only from a rare (≤ 60% RH) | **30% RH** from a greater's own attacks (Colossal Earthsplitter is the top) | 60% RH | 70% tank RH (tank buster) |
| Lethal mechanics | none | none | none | none |
| Soaks | none | none | allowed, pips = min(2, players tagging) | pips = min(3, players tagging) |
| Tethers | Cinderchain only | Vampiric Blood Tether, Twin link (break-type) | break-type only | break/keep |
| Tank handoff | none | none | none | stacks decay, never forced |
| Dialog opportunity | none | none | none | only inside a camp keep instance (§10.3) |
| Phases | 0 | 0 (the greater's thresholds, e.g. Frozen's shell at 50%/25%, are not phases) | 0–2 | 2–3 (reuse Farhold warlord phases) |
| Break bar | no (takes crowd control) | only Colossal and Unstoppable | no | yes (a boss) |
| Enrage | none | none | none | none |
| Health scaling | page 10 §5.12 | same (as an elite) | same | same |

### 22.4 World bosses (lighter-version rules; page 13 owns the bosses)

- **Mechanic budget**: 4–6 mechanics, **no lethal**, no tank handoff requirement (stacks decay), **no dialog
  opportunity** (lines only), no LoS-only kills (cover exists but hiding is optional damage reduction).
- **Soaks** scale with players present: pips = `clamp(ceil(present / 5), 1, 8)`.
- **Targeted** circles: `clamp(ceil(present / 8), 1, 10)` per cast, never more than one on the same player.
- **Void zones** cap at 12 on the field at once however many players there are (so a crowd cannot paint the
  whole field).
- **Adds**: reuse Farhold world-boss `minions` (first/add/every/max/radius), with `max` × (1 + present / 10),
  cap 40.
- **Health**: page 13 §3.3 owns the formula (`base × (0.6 + 0.08 × N)`, N = credited players, capped at 60;
  it falls at most 10% per 10 s).
- **Credit**: any player who dealt, healed or absorbed ≥ 1% of the boss's health, or was in the fight for
  ≥ 60 s, gets personal loot (once per boss per week, Monday 06:00; page 13 §5).
- **No arena lock**; a large leash (120 m). A world boss evades and resets only if **no player** is within 80 m
  for 30 s.

---

### 22.5 How rarity monsters telegraph (champion packs, rares, greater rarities)

Monster rarities (page 10 §7) add attacks to ordinary monsters. They speak **the same language** as bosses —
nothing new to learn — plus four small cues so a player can tell *where an attack came from*.

1. **Same colours, same shapes.** Every affix and greater-rarity attack is a §26 library mechanic (or a §26.11
   rarity mechanic) with its normal colour and shape. A Flaming carrier's burst is a red circle with flame
   particles on its edge (§3.1 rule 1); an Electrified carrier's Arc Link is yellow targeted marks.
2. **The badge on the cast bar.** When an attack comes from a rarity, its cast bar (on the nameplate, and in the
   boss frame for a targeted elite) shows the rarity's **badge** at the left, next to the telegraph-colour square
   (§7.1). A player learns "the flame badge means the circle will be big".
3. **Body cues for state changes.** Things that change how the monster takes damage (Spectral's Solid/Faded,
   Warded's flip, Cunning's sidestep, Hollow's Heart hiding, Undying's collapse, Twin's revive countdown) are
   shown **on the body** plus a 1.0–1.5 s chime (`tg_rarity_shift`, new sound), never with a ground colour
   (§3.1 rule 3). The nameplate shows the current state as an icon.
4. **Staggered clocks.** A monster with two or three greater rarities, or a greater plus mechanic affixes, runs
   them on offset clocks (each clock starts at a random point of its interval, and a new telegraph waits until
   1.5 s after the last one this monster started), so it never throws two new telegraphs inside 1.5 s. All of
   them count toward §4.3's "3 new telegraphs in 2.0 s" budget for the whole fight.
5. **Floors and ceilings.** Open world: the §4.1 open-world row (≥ 2.0 s; nothing lethal; a greater's own hits
   ≤ 30% RH, §22.3). Dungeon: the difficulty's row. Depth never shortens them.
6. **Packs share a clock.** A champion pack or a greater pack fires a shared mechanic from one member at a time
   (page 10 §7.2), so five Hoarfast hounds make one set of circles, not five.
7. **The first sighting.** The first time a character meets a greater rarity, the banner shows a one-line
   `mechanic` note under its name ("Frozen — four hits freeze you; fire breaks its shell"), once per rarity per
   character (the bestiary journal keeps the list, page 10 §11).

**Greater-rarity attack → telegraph** (numbers on page 10 §7.5.3):

| Greater | Extra attack | Library mechanic | Colour · shape | Warn: open world / N / C |
|---|---|---|---|---|
| Giant | Giant's Stomp | `mech_quake_ring` | red · circle 6 m on itself | 2.0 / 1.8 / 1.5 |
| Colossal | Earthsplitter · Tread · cleave | `mech_charge_line` (no movement) · `mech_void_pool` · `mech_cleave_cone` | red line 20 × 4 m · void 3 m · red cone 4 m | 2.5 / 2.0 / 1.7 · 1.0 warm-up · 1.5 / 1.5 / 1.2 |
| Flaming | Burning Trail · Flame Burst · death burst | `mech_trail_fire` · `mech_quake_ring` · `mech_slam_circle` | void trail · red 8 m · red 5 m | 0.5 warm-up · 2.0 / 1.8 / 1.5 · 2.0 / 1.8 / 1.5 |
| Electrified | Spark · Arc Link · Discharge | `mech_spark_runner` · `mech_chain_lightning` · `mech_eruption_pillars` | red moving ball · yellow marks · red 3 m under players | 1.0 (chip) · 2.5 / 2.5 / 2.0 · 2.0 / 1.8 / 1.5 |
| Frozen | Ice Prison · Ice Shell | `mech_encase_mark` · body cue | yellow 3 m · shell on the body | 2.5 / 2.5 / 2.0 · — |
| Venomous | Venom Spit · death pool | `mech_void_pool` | void 3 m / 6 m | 1.0 warm-up |
| Shadowed | Shadow Step · Drain the Light | `mech_slam_circle` · interruptible cast | red 2 m at arrival · gold-border cast bar | 2.0 / 1.5 / 1.5 · 2.0 cast |
| Tear-touched | Fold · Rift Seam · Tear Shard | `mech_swap_places` · `mech_undertow_pool` · `mech_power_orb` | yellow pair · void + inward arrows · green pickup | 2.5 / 2.5 / 2.0 · 1.0 warm-up · — |
| Plagued | Blight aura · plague rats | aura (debuff icon while inside) · `mech_add_swarm` | none on the ground · spawn glow 2.0 s | — · 2.0 |
| Ironclad | plates | `mech_weak_point` | plate panels on the body, pips on the nameplate | — |
| Spectral | Solid / Faded | `mech_phase_shift` | body cue + chime | 1.0 shimmer |
| Hollow | the Heart | `mech_weak_point` | a separate orb target with its own frame | — |
| Warded | ward flip · Ward Pulse | `mech_phase_shift` · `mech_knockback_nova` | body cue · red 5 m + white arrows | 1.5 flicker · 2.0 / 1.8 / 1.5 |
| Vampiric | Blood Tether | `mech_tether_break` (12 m) | white tether | 1.5 |
| Undying | collapse | `mech_revive_window` | gold outline on the body, 4 s bar | — |
| Enraged | Rampage | `mech_trample_path` | red chevron path | 2.0 / 2.0 / 1.7 |
| Swift | Dash Strike | `mech_charge_line` | red line 12 × 2 m | 2.0 / 1.8 / 1.5 |
| Unstoppable | Unstoppable Charge | `mech_trample_path` (flag `unstoppable`) | red chevron path, ⟫ on the cast bar | 2.5 / 2.0 / 1.7 |
| Cunning | Hunt · Sidestep | `mech_spread_mark` (one player, 2 m) · `mech_phase_shift` | yellow mark then red 2 m · body shimmer | 2.0 / 2.0 / 1.5 · — |
| Commanding | New Orders | interruptible cast | gold-border cast bar | 2.0 cast |
| Dreadful | Terrify | `mech_gaze` | eye icon over it, screen-side vignette | 2.5 cast |
| Twin | Grief revive | `mech_revive_window` | 10 s countdown over the survivor | — |
| Splitting | splits | `mech_revive_window` (1.0 s immune shimmer) | body cue | — |
| Echoing | the echo | `mech_echo_repeat` | the same shape again, from the echo | normal floor from when the first resolves |
| Ancient | Old Knowledge + its family's Depth ability II | body cue (rune flash) + page 10 §7.9.2 | as that ability | as that ability |
| Stormborn | Gale · Hail | `mech_wind_push` (outward) · `mech_eruption_pillars` | white arrows · red 3 m under players | 2.0 · 2.0 / 1.8 / 1.5 |
| Gilded | runs away | `mech_flee_runner` | a gold trail on the ground behind it (a cosmetic sparkle, not a zone) | — |
| Jewelled | Gem Spray | `mech_cleave_cone` | red cone 8 m 60° | 2.0 / 1.8 / 1.5 |

## 23. How followers handle mechanics

Followers are hired or class companions filling party slots (00 pillar 6; page 15/05 own the follower system;
reuse: Farhold `js/followers.js`, `js/pets.js`, R22 threat for companions). They must make **every Normal
dungeon** finishable solo. They read the **same telegraph data** the client draws (they "see" every zone) and
respond by rule, with a **reaction time** by quality:

| Follower quality | Reaction time | Mistake chance per mechanic |
|---|---|---|
| hired Common | 0.8 s | 10% (only on chip/light mechanics) |
| hired Veteran | 0.6 s | 5% (chip/light only) |
| class companion | 0.4 s | 0% |
| hired Elite | 0.3 s | 0% |

**The follower rule: followers never cause a wipe.** Their mistakes only ever cost **their own** health, never
a group-wide hit. Concretely:

| Mechanic | What followers do |
|---|---|
| danger zone | leave by the shortest safe path; never path through a void zone |
| void zone | never stand in one; a tank follower drags the boss out of them |
| soak | fill pips up to the number needed (they count the player in if the player is inside); never over-soak a "no more than N" soak |
| safe zone | go in; they hold 1 m from the edge |
| targeted (on a follower) | walk to the nearest spot ≥ 8 m from everyone else that is not in a zone |
| targeted (on the player) | step away from the player |
| beneficial | the right follower uses it (healers take mana wells, tanks take armour zones, whoever has the stacks takes a cleanse zone) |
| tether with the player | moves to satisfy the rule (break: runs out; keep: follows) |
| tank handoff | a tank follower Braces or steps into the Cleansing Pool at the threshold; a hybrid follower with a taunt takes the Handoff (§16) |
| interrupts | a follower with an interrupt is **assigned** to each gold-border cast; the Tactician's Orders and the follower command wheel (page 02) can reassign |
| dispels | a follower healer dispels the highest-priority debuff; waits for "punish on dispel" targets to step away (up to 3 s) |
| adds | damage followers switch to **priority** adds (skull) at once, to casters next, then back to the boss |
| fixates | a fixated follower kites the loop (§21.2) |
| line of sight | followers hide behind the nearest cover |
| puzzles | followers **do not** solve puzzles; every puzzle's interaction is the **player's** job, and puzzles in Normal dungeons are sized so one player can do them (§24) |
| dialog | followers never vote; may bark a suggestion ("I'd take the deal.") |
| knockback toward a ledge | a follower that falls is returned by the fall rule (§19) |

**Follower commands** (page 02 owns keys; page 06 Tactician extends them): Hold position, Stack on me, Spread,
Focus my target, Interrupt on/off, Use defensives now.

---

## 24. Puzzle bosses

A **puzzle boss** is a fight where solving something is the main way to win. Rules:

1. Every puzzle is taught by the **arena itself** before the pull (murals, a lever that does something small,
   a practice rune) — no outside knowledge needed.
2. Every puzzle has a **colour-blind-safe** version: runes carry **glyphs**, lights carry **shapes**, notes carry
   **pitch and a symbol**.
3. Solo + followers: every interaction can be done by one player (followers guard and fight adds). Group
   versions may need 2–5 people at once on Challenge.
4. A wrong answer **hurts** (a red telegraph with the normal warning), never instantly kills, and the puzzle
   **re-rolls** so brute force is slower than thinking.
5. Every puzzle has a time budget shown on the boss frame (the intermission clock, §11.3).

| Pattern id | What it is | Example use |
|---|---|---|
| `mech_puzzle_rune_order` | the boss lights 3–6 floor runes in order (each with a glyph); players step on them in the same order | a runic guardian |
| `mech_puzzle_colour_match` | carry a coloured orb (glyph on it) to the matching brazier | an enchanter's vault |
| `mech_puzzle_mirror_beams` | rotate mirrors to steer a light beam onto the boss's weak spot; the beam is a white line | a glass tomb |
| `mech_puzzle_lever_timing` | levers must be pulled within 1.5 s of each other (group) or in a rhythm (solo) | a flood gate |
| `mech_puzzle_true_copy` | the boss splits into copies; the real one is shown by one **tell** (a shadow, a voice, a reflection) taught earlier | an illusionist |
| `mech_puzzle_notes` | the boss sings a phrase; players ring bells in the same phrase | a choir boss |
| `mech_puzzle_weights` | pressure plates must carry a total weight (players, statues, adds pulled onto them) | a tomb door |
| `mech_puzzle_riddle` | a dialog opportunity with a riddle (§10) | a sphinx-like guardian |
| `mech_puzzle_path` | a hidden safe path through a void floor, revealed by a **glow-stone** a player lifts from a plinth in the arena (an arena object, not gear) | a gloom boss |

---

## 25. The design rules (fairness)

These are testable rules. A boss that breaks one is not shipped.

1. **Always telegraphed.** Every hit ≥ 5% RH has a telegraph (ground, body or cast bar) with a warning ≥ §4.
2. **Never two lethals overlapping.** No two lethal mechanics are ever telegraphed at the same time for the
   same player; a lethal waits.
3. **Never two severe hits within 1.5 s** on the same player from different mechanics.
4. **A safe spot always exists.** At every moment there is walkable ground reachable in the warning time
   (at walk speed 5.4 m/s, no dodge roll) that no active telegraph covers. The build tests this by simulation.
5. **The drawing is the hitbox.** Server and client use the same shape; straddlers are outside.
6. **Nothing hits on the frame it appears**, and void ticks never hit on the entry frame.
7. **No hidden rules.** Every mechanic's rule is in its tooltip (hover the cast bar spell, the debuff, the
   ground zone with the cursor free) in ≤ 20 words.
8. **Colour, shape and sound agree** (§3, §5, §6). No colour is used for anything else.
9. **Readable at 60 fps and at 30 fps.** Telegraphs are drawn with pooled materials and never recompile
   shaders mid-fight (playground lesson).
10. **Grabs end on their own** within 2.0 s, and a friend can break them early (reuse: Lanternfall "no grab
    asks for button mashing").
11. **No random one-shots.** A lethal mechanic always targets by a visible rule (a debuff, a position), never
    a hidden roll.
12. **Dodge roll is never required on Normal** (it is an unlock, 00 pillar 1); everything on Normal can be
    walked out of. Challenge may assume the roll (the character is 60 and has it).
13. **Every must-interrupt has a second answer** (§12.1). Every dispel mechanic in Normal ends by itself or
    has a green zone (§15). Every tank handoff has three answers and caps below severe on Normal (§16).
14. **Followers never cause a wipe** (§23).
15. **Ledges** follow §19; falling on Normal is not death.
16. **Knockbacks and pulls show their direction.**
17. **At most 3 new telegraphs start inside 2.0 s (N) / 1.5 s (C)** (§4.3).
18. **A mechanic is identical every time** for a given boss and difficulty (only positions and targets vary).
19. **Transitions are safe** (§11.2).
20. **The boss says what it will do** at least once per mechanic per fight on Normal (a line or a banner).
21. **Numbers, not feelings** in every tooltip (Farhold `WORDING.md`).
22. **Solo + followers** content never needs two players doing two things at once.

---

## 26. The mechanic library (121 mechanics)

Each row: id · name · shape · colour · warning **N / C** (s) · damage (base; pages override) · counterplay.
"Tank RH" means a tank buster. Damage is per hit unless it says per tick. Every library mechanic can have its
numbers overridden by the page that uses it, but not its colour or its rule.

### 26.1 Danger zones — hit once (red)

| id | Name | Shape | Colour | Warn N / C | Damage | Counterplay |
|---|---|---|---|---|---|---|
| `mech_quake_ring` | Quake | circle 6–10 m on the boss | red | 2.0 / 1.7 | 30% RH + knock up 0.5 s | step out |
| `mech_slam_circle` | Slam | circle 3–5 m at a point | red | 1.5 / 1.2 | 20% RH | step out |
| `mech_cleave_cone` | Cleave | cone 6 m 120° front | red | 1.5 / 1.2 | 25% RH (non-tanks) | stand behind or beside |
| `mech_tail_sweep` | Tail Sweep | cone 6 m 90° **behind** | red | 1.5 / 1.2 | 20% RH + knockback 8 m | don't stand directly behind |
| `mech_breath_cone` | Breath | cone 12 m 60°, facing locks at 50% | red | 2.0 / 1.7 | 45% RH + element status | side-step after lock |
| `mech_charge_line` | Charge | line 12–20 m × 2–3 m to a target | red | 2.0 / 1.5 | 25% RH + knockback | leave the line; others don't stand behind the target |
| `mech_beam_line` | Beam | line 30 m × 3 m, hits once | red | 1.8 / 1.5 | 40% RH | leave the line |
| `mech_cross_blast` | Cross | cross 25 m arms × 4 m | red | 2.0 / 1.7 | 35% RH | stand in a quadrant |
| `mech_rotating_cross` | Turning Cross | cross, then rotates 45° and repeats ×3 | red | 1.8 each / 1.5 | 25% RH each | move one quadrant each hit |
| `mech_donut` | Hollow Ring | donut 4–14 m (safe hole ≤ 4 m) | red | 2.0 / 1.7 | 35% RH | go in close |
| `mech_out_in` | Out Then In | circle 8 m, then donut 8–20 m 1.5 s later | red | 2.0 then 1.5 / 1.7 then 1.2 | 30% RH each | out, then back in |
| `mech_checker` | Checkerboard | 6 m tiles, alternate sets ×4 | red | 2.0 / 1.5 per set | 30% RH | stand on the tiles that just fired |
| `mech_marching_wave` | Marching Wave | wave band 4 m deep across the room, 2–3 gaps, 6 m/s | red | 2.5 shown / 2.0 | 40% RH + knockback | move to a gap |
| `mech_rolling_boulders` | Rolling Stones | 3–5 lines 3 m wide rolling at 7 m/s, each shown as a chevron path | red | 2.0 / 1.5 | 30% RH + knockdown | step between lanes |
| `mech_meteor_rain` | Firefall | 6–12 circles 3 m at random spots, staggered 0.4 s | red | 1.8 / 1.5 | 20% RH | watch your feet |
| `mech_eruption_pillars` | Eruption | circles 3 m under **every** player at once | red | 1.8 / 1.5 | 25% RH | step aside (don't stack) |
| `mech_arena_half` | Half the Room | rectangle: left or right half | red | 2.5 / 2.0 | 60% RH | cross to the other half |
| `mech_headtaker` | Headtaker (tank buster) | cone 5 m 60° on the tank | red + tank label | 2.5 / 2.0 | 70% tank RH | tank uses a defensive; others stay out |
| `mech_trample_path` | Trample | chevron path that bends once | red | 2.5 / 2.0 | 35% RH + knockdown | leave the path; watch the bend point |
| `mech_collapse_ring` | Closing Ring | ring band at the arena edge, 6 m deep, closes inward over 3 s | red | 2.5 / 2.0 | 50% RH | go to the middle |
| `mech_fire_ring_closing` | Burn It All | ring from edge inward, stops at 8 m radius, then becomes a void wall | red → void | 3.0 / 2.5 | 60% RH, then 5% RH per tick at the wall | get in the middle and stay |
| `mech_shockwave_ring` | Shockwave | expanding thin ring (0.8 m) from the boss, 10 m/s, **one gap** shown | red | 2.0 / 1.5 before it starts | 25% RH + knockback | stand where the gap passes |
| `mech_ground_spikes` | Spike Line | a line that grows toward a player at 8 m/s | red | 1.5 start / 1.2 | 20% RH + root 1 s | side-step |
| `mech_death_mark` | Death Sentence (lethal) | circle 10 m on a debuffed player after 8 s | red lethal | 8.0 (debuff) / 6.0 | 150% RH to others inside (the target takes 40%) | the target runs away from everyone |

### 26.2 Void zones — persist, tick every 0.5 s (purple-black)

| id | Name | Shape | Colour | Warm-up | Damage per tick | Counterplay |
|---|---|---|---|---|---|---|
| `mech_void_pool` | Pool | circle 4 m, lasts 30 s | void | 1.0 (on player) | 4% RH | move off; drop it at the edge |
| `mech_void_growing` | Spreading Rot | circle 3 m growing 0.5 m per 5 s, 60 s | void | 1.0 | 4% RH | drop it far away; kill fast |
| `mech_trail_fire` | Burning Trail | line trail behind a moving body, 2 m wide, 5 s | void | 0.5 | 3% RH + burn | don't chase through it |
| `mech_rotating_beam` | Sweeping Beam | line 20–30 m × 2 m rotating 30–40°/s | void | 1.5 (outline) | 6% RH | walk with the rotation |
| `mech_void_ring_wall` | Wall of Flame | ring at radius r, 1.5 m thick, lasts a phase | void | 1.0 | 6% RH | stay inside/outside as told |
| `mech_void_line_wall` | Firewall | line 12–20 m × 2 m, 8–15 s | void | 1.0 | 5% RH | go round |
| `mech_rising_flood` | Rising Flood | low ground fills in steps | void | 3.0 per step (line drawn) | 5% RH | climb |
| `mech_drop_puddle` | Leave a Puddle | a debuffed player drops a 3 m void every 3 s for 12 s | void | 0.5 | 4% RH | walk to the edge and drop them in a line |
| `mech_undertow_pool` | Undertow | circle 6 m pulling 1.5 m/s to its centre, 10 s | void + arrows | 1.0 | 3% RH | walk out against the pull |
| `mech_null_field` | Null Field | circle 10 m, 10 s; no spells inside | void (violet rim with slashed-book glyph) | 3.0 | none | fight outside, or use weapons |
| `mech_blight_cloud` | Blight Cloud | drifting 5 m cloud, 2 m/s, 20 s | void | 1.0 | 3% RH + blight | keep clear of its drift path (arrow) |
| `mech_shadow_seep` | Seeping Dark | tiles of floor go dark one by one, the whole phase | void | 2.0 per tile | 4% RH | stay on lit tiles |

### 26.3 Soaks (orange)

| id | Name | Shape | Warn N / C | Damage | Counterplay |
|---|---|---|---|---|---|
| `mech_soak_meteor` | Falling Star | circle 4 m, N pips | 3.0 / 2.5 | 200% RH split among soakers; if under-soaked, 60% RH to everyone | N players in |
| `mech_soak_tower` | Towers | 2–4 circles 3 m, 1 pip each, all at once | 3.0 / 2.5 | 50% RH to the soaker; unsoaked tower → 40% RH to the whole group | one player per tower |
| `mech_soak_stacking` | Stack Up | circle 5 m on a player (orange), whole group | 3.0 / 2.5 | 300% RH split | everyone stacks on the named player |
| `mech_soak_line` | Line Soak | line from boss to a player; everyone between splits | 3.0 / 2.5 | 150% RH split | stand in the line between |
| `mech_soak_debuffed` | Weighted Soak | soak that also gives soakers a stack (§18); players with 1+ stack must not soak the next | 3.0 / 2.5 | 120% RH split | rotate soak groups |

### 26.4 Safe zones (blue)

| id | Name | Shape | Warn N / C | Damage outside | Counterplay |
|---|---|---|---|---|---|
| `mech_safe_bubble` | Shelter | 1–3 circles 5 m | 4.0 / 3.0 | 90% RH (Challenge: 120%, lethal) | get in |
| `mech_safe_moving` | Wandering Shelter | circle 5 m moving 2 m/s | 5.0 / 4.0 | 80% RH | stay inside as it moves |
| `mech_safe_shrinking` | Shrinking Shelter | circle 10 m → 4 m over the cast | 4.0 / 3.0 | 90% RH | get in early |
| `mech_safe_by_role` | Right Shelter | 2 circles marked with role glyphs (shield/cross/sword) | 4.0 / 3.0 | 70% RH to anyone in the wrong one | go to your role's circle |
| `mech_safe_cover` | Hide! | LoS wedges behind cover (§21.1) | 3.0 / 2.5 | 70% RH | hide behind cover |

### 26.5 Targeted (yellow)

| id | Name | Shape | Warn N / C | Damage | Counterplay |
|---|---|---|---|---|---|
| `mech_spread_mark` | Scatter | circle 6 m on 1–6 players | 3.0 / 2.5 | 30% RH to everyone inside | spread 6 m apart |
| `mech_bomb_carrier` | Ticking Heart | circle 10 m on one player; explodes at the end | 5.0 / 4.0 | 60% RH to others inside (target 20%) | the target runs out |
| `mech_arrow_pin` | Pinning Shot | line 30 m to one player | 2.0 / 1.5 | 25% RH + root 1 s | others out of the line |
| `mech_chain_lightning` | Chain Spark | marks 3 players; jumps between players within 8 m | 2.5 / 2.0 | 20% RH per jump | spread 8 m |
| `mech_hurl_player` | Throw | marks a player; they are thrown 12 m (never over a ledge) | 2.5 / 2.0 | 15% RH + knockdown | healers pre-heal; others clear the landing (red circle 3 m shown) |
| `mech_drop_point` | Drop It There | player carries a mark that places a void where it ends | 5.0 / 4.0 | (places `mech_void_pool`) | walk to the edge |
| `mech_fixate_chase` | Fixate | add chases one player (§21.2) | 1.5 before it starts | varies | kite |
| `mech_fixate_explode` | Fixate and Burst | as above; explodes on contact (red circle 4 m, 1.0 s) | 1.5 | 40% RH | kite, slow, kill |
| `mech_mark_of_prey` | Marked | target takes +25% from the boss 10 s | 2.0 / 1.5 | — | defensives; healer focus |

### 26.6 Beneficial (green)

| id | Name | Shape | Duration | Effect | Counterplay |
|---|---|---|---|---|---|
| `mech_heal_well` | Healing Spring | circle 4 m | 15 s | 5% max health per 1 s | use when needed; the boss may corrupt it (turns void, 2.0 s warning) |
| `mech_cleanse_pool` | Cleansing Pool | circle 3 m | 10 s | removes 1 stack per 1 s of a named debuff | the stacked player steps in |
| `mech_power_orb` | Power Shard | orb pickup 1 m | 20 s | +20% damage 15 s to the picker | damage player grabs it |
| `mech_warm_fire` | Warming Fire | circle 5 m | phase | drains Chill 10 per s (§20) | stand in during cold pulses |
| `mech_shield_rune` | Warding Rune | circle 3 m | 10 s | 30% RH absorb to whoever stands in | the target of the next hit takes it |

### 26.7 Tethers (white)

| id | Name | Rule | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| `mech_tether_break` | Bound Pair | break by distance > 15 m | 1.5 | 3% RH per tick while linked | run apart |
| `mech_tether_keep` | Chained | keep within 8 m for 10 s | 1.5 | 40% RH to both if stretched | move together |
| `mech_tether_share` | Shared Pain | damage split between the pair | — | — | pair similar health |
| `mech_beam_intercept` | Intercept | boss–target beam; another player steps in to take it | 2.0 | 30% RH per 1 s to whoever is at the end | take turns |
| `mech_anchor_link` | Anchor | add tethered to the boss makes it immune | — | — | kill the add or pull it 20 m |
| `mech_tether_cross` | Tangle | 2 pairs; tethers must not cross | 2.0 | 30% RH to all 4 if crossed | untangle positions |

### 26.8 Movement: knockbacks, pulls, grabs

| id | Name | Shape | Colour | Warn N / C | Effect | Counterplay |
|---|---|---|---|---|---|---|
| `mech_knockback_nova` | Repel | circle 8 m on the boss | red + white arrows out | 2.0 / 1.7 | 10% RH + knockback 15 m | stand with your back to a wall, or use immunity |
| `mech_pull_in` | Undertow Pull | whole room | white arrows in (no damage) | 1.5 / 1.2 | pulled to 3 m of the boss, then `mech_quake_ring` 1.5 s later | run out after the pull |
| `mech_grab_hold` | Grab | targeted 2.0 s | yellow | 2.0 / 1.5 | held 2.0 s, 5% RH per tick; others free by hitting the hand for 5% of the boss's health | friends break it |
| `mech_launch` | Launch | circle 4 m | red + up arrow | 2.0 / 1.7 | 20% RH + launched 25 m (stagger 1 s on landing) | avoid, or aim your back to the safe side |
| `mech_swap_places` | Fold Space | 2 targeted players | yellow | 2.5 / 2.0 | swap positions | make sure neither stands in a zone |
| `mech_wind_push` | Gale | room-wide arrows | white arrows | 2.0 / 1.5 | pushed 10 m in one direction | brace behind cover, or walk against |

### 26.9 Adds

| id | Name | Warn | What | Counterplay |
|---|---|---|---|---|
| `mech_add_wave` | Call the Guard | 2.0 (spawn glow) | 2–4 bruisers/casters | tank picks up; interrupt casters |
| `mech_add_swarm` | Swarm | 2.0 | 6–12 swarm | area spells |
| `mech_add_shieldbearer` | Shield-Bearers | 2.0 | 2 adds tethered to the boss (anchor) | kill them |
| `mech_add_bombers` | Bombers | 2.0 | adds walk to players and explode | kill or kite |
| `mech_add_soaker` | Sacrifice | 2.0 | add must die inside a green circle or it heals the boss 5% | drag and kill |
| `mech_add_totem` | Totem | 1.5 | an object that buffs the boss +20% damage | destroy |
| `mech_add_reflection` | Reflections | 2.0 | copies of players (their silhouette) with 30% of the boss's damage | burst; each copy hits only its original's allies |

### 26.10 Casts, buffs, debuffs and stacks

| id | Name | Kind | Warn | Effect | Counterplay |
|---|---|---|---|---|---|
| `mech_heal_self` | Mend | interruptible cast (gold) | 2.5 cast | heals the boss 10% | interrupt / break focus |
| `mech_must_interrupt` | Obliterate | MUST INTERRUPT cast | 3.0 cast | 80% RH to the whole group | interrupt, or deal 10% of its health during the cast, or LoS |
| `mech_brace_pulse` | Brace | unavoidable room-wide | 1.5 banner | 25% RH to everyone | defensives; healers |
| `mech_sundering_blow` | Sunder | tank stack | — | +12% boss melee taken per stack, 20 s | tank handoff, brace or cleanse at 4 (N, capped at 3) / 3 (C) (§16) |
| `mech_curse_spread` | Creeping Curse | dispellable curse | 2.0 | 4% RH per s; spreads to players within 5 m every 4 s | spread; dispel |
| `mech_dispel_punish` | Unstable Hex | dispel-punish magic debuff | 2.0 | 3% RH per s; dispel → red circle 6 m 1.5 s, 40% RH | step away, then dispel |
| `mech_stack_chill` | Deepening Cold | group stacks meter | — | slows; freeze at 100 | warm fire (green) |
| `mech_gaze` | Gaze | facing check | 2.5 cast + eye icon | `dazed` 3 s (Challenge: 60% RH + dazed) | turn away |
| `mech_silence_pulse` | Hush | room-wide silence | 2.0 | no spells 3 s | pre-cast shields, use weapons |
| `mech_purge_buffs` | Unravel | room-wide dispel of player buffs | 2.5 cast (gold border) | removes 1 magic buff from everyone | interrupt, or re-apply |
| `mech_enrage_wrath` | Wrath | soft enrage | at timer | +10% damage every 30 s | kill faster |
| `mech_enrage_final` | The Final Cast | hard enrage | 10.0 cast, lock icon | 999% RH to everyone | kill before |
| `mech_arena_shrink` | Closing In | soft enrage | 3.0 per step | arena edge void grows 1 m every 10 s | kill faster |

### 26.11 Rarity mechanics (new in round 2; page 10 §7 cites them)

Small mechanics that champion packs, rares and greater-rarity carriers need and bosses may borrow.

| id | Name | Kind | Warn N / C | Effect | Counterplay |
|---|---|---|---|---|---|
| `mech_spark_runner` | Spark | a small **red** ball 1 m that runs along the ground | 1.0 (chip, ≤ 6% RH) | 6% RH + shock to the first player touched; 7 m/s, 10 m, then fizzles | step aside |
| `mech_encase_mark` | Ice Prison | **yellow** targeted circle 3 m | 2.5 / 2.0 | everyone inside at the end is encased 2 s (stunned and immune); 2 hits from a friend free them early | the marked player moves away from others |
| `mech_phase_shift` | Shift | body cue + `tg_rarity_shift` chime, no ground mark | 1.0–1.5 before the switch | the monster changes what hurts it (a damage tag, a ward, a sidestep ready); the nameplate icon shows the new state | switch damage type or wait |
| `mech_weak_point` | Weak Point | a visible part of the body (a plate, an orbiting heart) that is its own target or its own side | — | hits on the weak point deal full damage, elsewhere reduced (the rarity says how much) | Tab to it, or hit from its side |
| `mech_revive_window` | Reforming | a **gold outline** on a downed or grieving body + a countdown bar on its nameplate | the countdown (4–10 s) | if the stated damage is not dealt (or the partner not killed) before the bar ends, it stands up / revives | burst it inside the window |
| `mech_echo_repeat` | Echo | the same telegraph again, from an after-image | the normal floor, starting when the first resolves | the attack happens a second time 1.5 s later | move across the shape, not back into it |
| `mech_flee_runner` | Runner | a gold sparkle trail (cosmetic, not a zone) | — | the monster flees toward other packs; it vanishes if it gets far enough away | slow, root and stun it |

### 26.12 Environment and puzzles (cited from §20 and §24)

`mech_env_lava`, `mech_env_rising_tide`, `mech_env_current`, `mech_env_falling_rocks`, `mech_env_collapse`,
`mech_env_darkness`, `mech_env_cold`, `mech_env_heat`, `mech_env_poison_fog`, `mech_env_lightning_storm`,
`mech_env_quicksand`, `mech_env_ice_slick`, `mech_env_wind_gust` (13, specified in §20) and
`mech_puzzle_rune_order`, `mech_puzzle_colour_match`, `mech_puzzle_mirror_beams`, `mech_puzzle_lever_timing`,
`mech_puzzle_true_copy`, `mech_puzzle_notes`, `mech_puzzle_weights`, `mech_puzzle_riddle`, `mech_puzzle_path`
(9, specified in §24).

### 26.13 Count

| Group | Count |
|---|---|
| Danger zones | 24 |
| Void zones | 12 |
| Soaks | 5 |
| Safe zones | 5 |
| Targeted | 9 |
| Beneficial | 5 |
| Tethers | 6 |
| Movement | 6 |
| Adds | 7 |
| Casts, buffs, stacks, enrage | 13 |
| Rarity mechanics (26.11, new) | 7 |
| **Library rows (26.1–26.11)** | **99** |
| Environment (§20) + puzzles (§24) | 22 |
| **All `mech_*` ids** | **121** |

Page 10's monster abilities, standard affixes and greater rarities cite: `mech_charge_line`, `mech_trail_fire`,
`mech_quake_ring`, `mech_chain_lightning`, `mech_swap_places`, `mech_undertow_pool`, `mech_gaze`,
`mech_env_cold`, `mech_env_rising_tide`, `mech_env_lava`, `mech_fixate_chase`, the seven rarity mechanics and
others from this list.

---

## 27. Data shapes

`data/mechanics.json` (new; page 16 owns the file list). One row per library mechanic:

```json
{
  "id": "mech_breath_cone",
  "name": "Breath",
  "colour": "danger",
  "shape": { "kind": "cone", "length": 12, "angle": 60, "origin": "boss", "facing": "target", "lockAt": 0.5 },
  "warn": { "normal": 2.0, "challenge": 1.7, "openWorld": 2.5 },
  "category": "heavy",
  "damage": { "rh": 0.45, "element": "fire", "status": "burn" },
  "sound": "tg_danger",
  "banner": null,
  "fx": { "edge": "flame", "impact": "fire" },
  "counterplay": "Side-step after the cone locks.",
  "flags": [],
  "block": true,
  "parry": true,
  "tooltip": "Breath: 12 m cone, locks halfway. 45% health as fire, then burning."
}
```

`flags` holds any of `mechanic`, `unavoidable`, `unstoppable` (§12.3). `block: false` draws the cracked-shield
icon on the cast bar (unblockable) and `parry: false` the crossed-swords icon (unparryable) (§7.1). A phase's
`noShapes: true` forces caster form (§12.3).

A boss script (pages 12/13 write these; reuse shape: Farhold `phases[{ at, modifier, say }]` grown up):

```json
{
  "id": "b_kingsfire_warmarshal",
  "size": "medium",
  "turnRate": 105,
  "targetTime": 240,
  "enrage": { "soft": "wrath", "hard": true },
  "voice": { "role": "warrior", "gender": "m", "seed": 5521 },
  "lines": { "open": "bl_b_kingsfire_warmarshal_open", "death": "bl_b_kingsfire_warmarshal_death" },
  "phases": [
    {
      "id": 1, "until": 0.6, "noShapes": false,
      "rotation": [
        { "use": "mech_headtaker", "every": 18, "say": "bl_b_kingsfire_warmarshal_headtaker", "lead": 0.5 },
        { "use": "mech_void_line_wall", "every": 25, "override": { "length": 16 } },
        { "use": "mech_sundering_blow", "passive": true }
      ]
    },
    {
      "id": 2, "until": 0.0, "transition": 3.0,
      "onEnter": [{ "use": "mech_add_wave", "override": { "adds": "m_kingsfire_legionnaire", "count": 4 } }],
      "rotation": [
        { "use": "mech_fire_ring_closing", "every": 45, "say": "bl_b_kingsfire_warmarshal_burn" },
        { "use": "mech_headtaker", "every": 15 }
      ]
    }
  ],
  "dialog": [
    {
      "at": 0.5, "timer": 10,
      "line": "bl_b_kingsfire_warmarshal_parley",
      "replies": [
        { "tone": "honour", "text": "Your king is finished.", "outcome": { "kind": "debuff_boss", "damage": -0.15 } },
        { "tone": "defiance", "text": "Draw.", "fight": true, "outcome": { "kind": "none" } }
      ],
      "onSilence": { "normal": "none", "challenge": { "kind": "buff_boss", "damage": 0.1 } }
    }
  ],
  "scaling": { "targets": { "1": 1, "3": 1, "4": 2, "5": 2 }, "soakPips": { "normal": 2, "challenge": 3 } },
  "depthList": ["mech_meteor_rain", "mech_void_line_wall", "mech_spread_mark"]
}
```

---

## 28. Tests the build must have

1. **Colour meaning is closed**: every mechanic row's `colour` is one of the seven; a grep over the effect code
   finds no other hue used for enemy ground telegraphs.
2. **Warning floors**: for every mechanic × difficulty × context, the effective warning (after every speed-up)
   is ≥ §4.1 for its damage category. Chip exemption only when damage ≤ 5% RH.
3. **No overlapping lethals** and **no two severe hits within 1.5 s** — a headless simulator runs every boss
   script for 10 minutes × 50 seeds per difficulty and checks rules 2–4 of §25 (a safe spot reachable at 5.4 m/s
   always exists).
4. **Hitbox = drawing**: the server's shape test and the client's decal are generated from the same row; a
   test samples 10,000 points per shape and compares.
5. **Void ticks** never hit on the entry frame and follow the warm-up rules.
6. **Dialog**: majority / tie / leader / changed-vote / silence rules produce the right outcome for every vote
   combination in a party of 2, 3, 4 and 5 players (with and without followers, who never vote).
7. **Followers**: a follower bot party clears every Normal dungeon boss script in simulation with the player
   standing still except for puzzle interactions — proving the follower rule and §25 rule 22.
8. **Scaling**: soak pips and target counts use **living players present**, tested by killing players mid-cast.
9. **Every `mech_*` cited** on pages 10, 12 and 13 exists in `data/mechanics.json` (and every row is cited by at
   least one page, or is flagged as spare).
10. **Dead-data check** (playground lesson): move a mechanic knob to an odd value (e.g. `mech_quake_ring` radius
    7.3) and assert the running server and the drawn decal both changed — never compare the file to a constant.
11. **Accessibility**: each palette in §3.2 keeps every pair of telegraph colours at a contrast/hue distance the
    validator accepts, and glyphs render with colour turned off.
12. **Shader stutter**: a scripted world-boss pull with 40 simultaneous telegraphs triggers **zero** shader program
    links after the first second (count `linkProgram` calls, playground lesson).
13. **Five players**: no boss script, mechanic or scaling row reads a group size above 5 except world-boss rows
    (§22.4); a grep for "raid" in `data/mechanics.json` and boss scripts finds nothing.
14. **Rarity telegraphs**: for 10,000 rolled carriers with two or three greater rarities, a simulator checks that
    no monster starts two new telegraphs inside 1.5 s, that every greater attack's cast bar carries its badge,
    and that no greater attack in the open world exceeds 30% RH (§22.5).
15. **Tank handoff**: on Normal a lone tank with no taunt partner never takes a severe Sunder hit (stacks cap at
    threshold − 1); on Challenge each of the three answers (handoff, brace, cleanse) clears the stacks in a
    scripted fight.
16. **Depth mechanics**: at every Depth tier the §4.1 floors of the chosen difficulty still hold, and no boss
    gains a lethal it did not have.
17. **Turn rates** (§21.3): every boss script has a `turnRate` equal to its size row (or 0 for a stationary boss,
    or a value in 90–120°/s with a reason); a simulated boss holding still on a tank while a second player
    circles it at walk speed reaches a 150°-cone blind spot in the time the table predicts (± 0.1 s); no boss
    turns while casting a non-tracking mechanic; Challenge and every Depth tier leave `turnRate` unchanged.
