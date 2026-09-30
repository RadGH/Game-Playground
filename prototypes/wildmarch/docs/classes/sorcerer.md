# Sorcerer — class 25

> *"I don't pick the element. I pick the moment. The Wheel picks the rest."*

**Role:** Damage · **Armour:** cloth · **Resource:** Mana + the **Wild Wheel** gauge · **Primary attribute:** INT
Owner of this file: every `sorcerer_*` spell, talent, set, legendary and unique. Follows the template in
[page 00 §5](../00-OVERVIEW.md). Combat maths (spell power, crits, statuses) are owned by [page 05](../05-COMBAT.md).

### Numbers used on this page

| Term | Meaning |
|---|---|
| **SP** | spell power. "120% SP" = 1.2 × your spell power, before crit and resist (page 05 owns the formula) |
| Mana cost | written as **% of base maximum Mana** so it scales with level (a L60 Sorcerer has ~2,400 base Mana — page 07) |
| GCD | global cooldown: 1.0 s lockout after any spell, cut by haste to a 0.75 s floor |
| Flux | the Sorcerer's second gauge, 0–100 (§2). Named **Flux** so it is not confused with the Mage's and Dragon Knight's Flux (QUESTIONS.md C17) |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A caster who never learned control — they learned to *ride* the chaos. Every spell comes out as a random element; the skill is in timing, reading the Wheel and cashing in Flux. |
| Role | Damage (ranged, burst-and-spread). No tank or heal spec. |
| Armour | cloth (robes, hoods, pointed shoes) |
| Weapons | staff (two hands) or wand + focus (off hand: Grimoire / Seer's Orb / Effigy, `(reuse: prototypes/farhold/js/foci.js)`) |
| Resource | Mana (big pool, slow regeneration: 1.2% of max per second, 3% out of combat) |
| Companion | **Wheel Mote** — a fist-sized floating spark that orbits the Sorcerer's head and takes the colour of the next element on the Wheel. Cosmetic + a readable tell for other players; it does not fight. `(reuse: storm_familiar look, farhold/js/pets.js, recoloured)` |
| Playstyle | 1) Cast Flux Bolt to spin the Wheel and fill Flux. 2) Watch the next element and fire your big spells when it's the one you want (or Nudge it). 3) Flux at 100, roll the Chaos Table, cash the result. |

Starting kit: Apprentice's Wand, cloth robe, cloth hood, 1 spell (`sorcerer_flux_bolt`).

---

## 2. Class mechanic — Wild Magic (the Wild Wheel)

Every **Wild** spell (all six are Wild) is cast in an element chosen by the Wheel, not by you.

### 2.1 The four elements of the Wheel

| Segment | Element (spellfx) | Rider added to every hit of a Wild spell | Colour |
|---|---|---|---|
| **Ember** | `fire` | *Scorched*: 30% SP extra fire damage over 4 s (ticks every 1 s) | orange |
| **Rime** | `ice` | *Rimed*: 25% slow for 3 s. Bosses: no slow; instead +5% crit chance for the Sorcerer against it for 3 s | pale blue |
| **Spark** | `lightning` | *Arced*: the hit jumps to 1 more enemy within 8 m for 40% of its damage | yellow |
| **Hollow** | `arcane` | *Hollowed*: you regain Mana equal to 0.5% of max per enemy hit (cap 3% per cast) | violet |

- A spell takes the element that is **under the pointer when the cast finishes** (not when it starts).
  After each Wild cast the Wheel spins to a new random segment (it can land on the same one: 25%).
- **Immunities:** if the target is immune to the rolled element, the rider is lost and the base damage lands
  as *Wild* (untyped) damage at 80%. A Sorcerer never does zero damage to anything. (Boss tooltips list
  immunities — page 11.)

### 2.2 Flux and the Chaos Table

- Every Wild cast adds Flux: +8 (Flux Bolt), +12 (other spells), +4 per extra enemy hit (cap +20 per cast).
- At **100 Flux** your next cast finishes with a **Flux release**: the Chaos Table rolls a d20 and the result
  happens on top of the spell. Flux resets to 0. Flux decays 5 per second after 10 s out of combat.
- **The Chaos Table never harms another player** and never kills you. Results 1–2 are harmless jokes, and they **never roll inside a raid** — there the d20 rerolls a 1 or 2 (open world and dungeons only; QUESTIONS.md C13).

| d20 | Result | Effect in numbers |
|---|---|---|
| 1 | Confetti | Coloured sparks burst from you. Nothing else. A bark plays. |
| 2 | Wrong Hat | Your hat becomes a random other hat for 60 s (cosmetic). +5 Flux. |
| 3 | Mana Spill | Regain 10% of max Mana. |
| 4 | Doubled | The spell is cast a second time for free, same target, 60% power. |
| 5 | Blink | You teleport 8 m in the direction you are moving (or back, if standing still). |
| 6 | Quickened | +30% cast speed for 6 s. |
| 7 | Wound Clock | All of your spell cooldowns drop by 3 s. |
| 8 | Ember Rain | 5 fireballs fall at random enemies within 20 m, 60% SP fire each, 2 m radius. |
| 9 | Rime Nova | 8 m ring around you, 80% SP ice, Rime rider. |
| 10 | Chain Storm | A lightning bolt chains through 6 enemies within 12 m, 70% SP each. |
| 11 | Hollow Well | A 5 m violet pool at your feet for 8 s: allies inside regain 1% max Mana per second. |
| 12 | Four-Fold | The next 4 Wild casts each get **all four** riders. |
| 13 | Glass Skin | Barrier on you: 20% of your max health for 8 s. |
| 14 | Echo Wheel | For 8 s every Wild cast rolls twice and applies both riders. |
| 15 | Ricochet | Your next 3 Flux Bolts bounce to 2 extra enemies at 60%. |
| 16 | Wild Familiar | The Wheel Mote fights for 10 s: fires a 70% SP bolt every 1 s at your target. |
| 17 | Refund | This cast cost nothing and its cooldown is reset. |
| 18 | Borrowed Luck | +25% crit chance for 6 s. |
| 19 | Star Fall | 6 s later a 7 m star crashes on your target: 400% SP Wild damage (shown as a red danger zone to *enemies*, a gold ring to allies). |
| 20 | **Wild Crown** | For 8 s every Wild spell deals +50% and its Flux gain is doubled. Screen edge glows prismatic. |

### 2.3 The gauge (HUD)

- A **ring of four coloured segments** (Ember/Rime/Spark/Hollow) sits left of the spell bar, 64 px.
  A white **pointer** shows the next element. The Wheel Mote over your head matches it, so allies can read it too.
- A thin **Flux arc** wraps the outside of the ring, filling clockwise 0→100; at 90+ it flickers.
- The last Chaos result shows as an icon + name in the ring's centre for 3 s, and in the combat log (page 03 `scr_combat_log`).
- **Nudge charges** (from Calling 20) are two pips under the ring.

### 2.4 Calling quests (page 14 owns the quest text)

| Level | Quest id | What you do (summary) | What it grants |
|---|---|---|---|
| 1 | — | — | Elements roll at random. **No gauge, no preview**, no Flux. |
| 6 | `q_calling_sorcerer_1` | Hearthvale: collect 4 "stray sparks" by killing things with each of the four elements (Ember, Rime, Spark, Hollow), then read the Cracked Wheel in the old mill. NPC `npc_magister_orlo_quint`. | The **Wild Wheel gauge**, the next-element preview, **Flux** and the Chaos Table. |
| 20 | `q_calling_sorcerer_2` | Sunscar: survive the "Wild Storm" event at a glass tomb while the Wheel spins every 0.5 s; land 20 hits in a row without a miss. | **Nudge** (class key **`Q`**, page 02 §5.16): push the pointer one segment clockwise. 2 charges, 1 charge per 12 s. No GCD. Chaos Table results 1–2 are replaced by rolling again once. |
| 40 | `q_calling_sorcerer_3` | Drowned Coast → Riftmarch: steal a die from a drowned gambler-spirit, win three rolls against it (a dialog opportunity: bet, bluff or cheat), then shatter it at a rift. | **Chosen Chaos**: at each Flux you see **three** rolled results as cards for 2 s and click one (default: the highest). Flux threshold drops to 80. |

---

## 3. The six spells

### 3.1 At a glance

| Slot | id | Name | Lvl | Cost | CD | Cast | Range | Shape | Main number |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `sorcerer_flux_bolt` | Flux Bolt | 1 | 1.5% Mana | — | 1.4 s | 38 m | bolt | 120% SP + rider |
| 2 | `sorcerer_prism_spray` | Prism Spray | 4 | 4% Mana | 8 s | instant | 9 m | 60° cone, 3 bands | 3 × 75% SP |
| 3 | `sorcerer_unstable_orb` | Unstable Orb | 10 | 6% Mana | 14 s | instant | 20 m travel | moving orb, 3 m pulses | 7 × 45% SP + 180% SP pop |
| 4 | `sorcerer_fortunes_shell` | Fortune's Shell | 18 | 5% Mana | 30 s | instant | self | self barrier | 25% max HP barrier |
| 5 | `sorcerer_chance_maelstrom` | Chance Maelstrom | 28 | 10% Mana | 24 s | 3 s channel | 32 m | ground, 7 m circle | 6 × 70% SP |
| 6 | `sorcerer_sixfold_die` | The Sixfold Die | 40 | 12% Mana | 60 s | 1.5 s | 40 m | ground, 8 m circle | 1d6 × 110% SP |

### 3.2 Details

**`sorcerer_flux_bolt` — Flux Bolt** (slot 1, level 1) `(new)`
- 1.5% Mana · no cooldown · 1.4 s cast (standing still; the Walking Cast talent lets you move) · 38 m · bolt, 1.2 m splash.
- 120% SP in the Wheel's element + that element's rider. +8 Flux.
- Look: `spellfx` projectile of the rolled element (`fire` cone / `ice` shards / `lightning` bolt / `arcane` helix), a ring of the other three colours flickering around it. Sound: `sfx` `launch_<element>` pitched up 10%, a tick like a roulette wheel on release.

**`sorcerer_prism_spray` — Prism Spray** (slot 2, level 4) `(new)`
- 4% Mana · 8 s · instant · 9 m · 60° cone split into **three 20° bands**; the Wheel rolls **three times at once**, one element per band (left, middle, right, shown on the Wheel as three pointers for 0.5 s).
- Each band: 75% SP + its rider. An enemy standing on a band border is hit by both (max 2 bands).
- +12 Flux. Look: a fan of three coloured streams (spellfx `cone` in each element's palette). Sound: three overlapping `launch` sounds, a glassy chord.

**`sorcerer_unstable_orb` — Unstable Orb** (slot 3, level 10) `(new)`
- 6% Mana · 14 s · instant · fires a 1 m orb that drifts **4 m/s** in the direction you aim, up to 20 m (5 s).
- Every 0.7 s it pulses 45% SP in 3 m, **re-rolling its element each pulse** (its colour changes). 7 pulses.
- **Recast** (press again) to pop it early, or it pops at the end: 180% SP in 6 m in its current element.
- +12 Flux on cast, +2 per pulse that hits. Look: a wobbling sphere of shifting colour with arcs of the next colour crawling over it (spellfx `arcane` helix trail + element impact per pulse). Sound: a low humming loop that rises in pitch; `impact_<element>` on pop.

**`sorcerer_fortunes_shell` — Fortune's Shell** (slot 4, level 18) `(new)`
- 5% Mana · 30 s · instant, off the GCD · self.
- Barrier: 25% of your max health for 6 s. When it breaks **or** expires, flip a coin (shown over your head):
  - *Heads:* the shell bursts outward — 150% SP Wild damage in 5 m and knocks enemies back 4 m.
  - *Tails:* you heal for the barrier's remaining value + 10% of max health.
- Both results are good; heads is 50%, tails 50%. Look: a translucent gold coin-faced sphere (STATUS_FX `barrier` recoloured gold), the coin spins over your head. Sound: coin flip + chime.
- This is the Sorcerer's defensive cooldown.

**`sorcerer_chance_maelstrom` — Chance Maelstrom** (slot 5, level 28) `(new)`
- 10% Mana · 24 s · 3 s channel (you can turn, not move) · 32 m · ground, 7 m circle.
- 6 strikes, one every 0.5 s, each 70% SP in the circle, each in a **freshly rolled element** with its rider.
- If one channel lands **all four** elements, the circle ends with a **Prismatic Burst**: 150% SP to everything inside.
  (Chance with 6 random rolls ≈ 38%; Nudge and talents raise it.)
- +12 Flux, +2 per strike that hits. Look: a swirling multicoloured cloud with bolts of each element falling from it. Sound: `ambience` storm loop, `impact_<element>` per strike, a bell on Prismatic Burst.

**`sorcerer_sixfold_die` — The Sixfold Die** (slot 6, level 40) `(new)`
- 12% Mana · 60 s · 1.5 s cast · 40 m · ground, 8 m circle. A giant six-sided die of the Wheel's element falls, lands after 1.0 s and rolls.
- Damage = **face × 110% SP** in the circle (1 → 110%, 6 → 660%; average 385%) + the rider.
- Face 6: also grants a full Flux (100). Face 1: the die cracks into 3 small dice that fall on 3 random enemies within 12 m for 110% SP each (so a 1 is never a waste).
- Friendly players see the falling die as a gold ring (no danger to them); enemies' AI sees a red danger zone.
- Look: a 2 m die built from the element's shapes (flame cone, shards, bolts, helix), with pips of light; the rolled face glows over the crater for 2 s. Sound: wooden clatter scaled up to a thunderclap.

---

## 4. Alternate spells

The Sorcerer has no forms. Two things swap spells for a short time:

| Trigger | Spell replaced | Replacement | Numbers |
|---|---|---|---|
| Chaos **Wild Crown** (d20 = 20) active | Flux Bolt | **Crowned Bolt** `sorcerer_crowned_bolt` | instant, 150% SP, all four riders, 1% Mana |
| Calling 40 + holding Flux ≥ 80 for 3 s without spending | Prism Spray | **Prism Wall** `sorcerer_prism_wall` | 12 m wide, 3 m tall wall of 3 elements for 6 s; enemies crossing it take 120% SP + the band's rider. Then Prism Spray returns. |

Both show a glowing border on the slot and a 1-line card the first time (page 03).

---

## 5. Talents

One pick per tier. Tiers open at **12 / 22 / 32 / 45**. Ids `<spellid>_t<tier><a|b|c>`. Engine: per-skill talent trees
`(reuse: prototypes/farhold/js/skilltalents.js — one node per tier, text built from the node's numbers)`, with Wildmarch's tier levels instead of Farhold's 3/8/18/28.

### Flux Bolt
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `sorcerer_flux_bolt_t1a` | Walking Cast | Can be cast while moving at 60% speed; cast time 1.6 s. |
| 12 | `sorcerer_flux_bolt_t1b` | Split Flux | Fires 2 bolts in a 10° fan, 70% SP each, different elements. |
| 22 | `sorcerer_flux_bolt_t2a` | Mana Burn | Against an enemy with mana/energy: burns 5% of its mana and deals +1% damage per 1% burned; interrupts a gold-bordered cast once per 20 s. |
| 22 | `sorcerer_flux_bolt_t2b` | Residue | The impact leaves a 2 m puddle of its element for 4 s (45% SP per s + rider). |
| 32 | `sorcerer_flux_bolt_t3a` | Loaded | Every 5th Flux Bolt is instant and guaranteed Hollow or your choice via one free Nudge. |
| 32 | `sorcerer_flux_bolt_t3b` | Counterspark | A Flux Bolt that crits adds +10 Flux instead of +8. |
| 32 | `sorcerer_flux_bolt_t3c` | Tracer | The bolt homes on the target through up to 90° of turn. |
| 45 | `sorcerer_flux_bolt_t4a` | Conduit | Flux Bolt becomes a 1.4 s channelled beam, 26 m, 4 ticks of 45% SP, the beam re-rolls its element each tick. |
| 45 | `sorcerer_flux_bolt_t4b` | Wild Barrage | Holding the key fires a new bolt each 0.9 s (instant each, 2% Mana each) up to 6 in a row. |

### Prism Spray
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `sorcerer_prism_spray_t1a` | Narrow Prism | Becomes a 16 m line, 3 m wide, all three elements stacked on every target. |
| 12 | `sorcerer_prism_spray_t1b` | Full Circle | Becomes a 6 m ring around you, three 120° bands. |
| 22 | `sorcerer_prism_spray_t2a` | Scatterlight | Enemies hit by 2 bands are knocked back 5 m. |
| 22 | `sorcerer_prism_spray_t2b` | Glass Scatter | Each band leaves a 1 s after-image that hits again for 30%. |
| 32 | `sorcerer_prism_spray_t3a` | Colour Match | If two or three bands roll the same element, that band's damage is doubled. |
| 32 | `sorcerer_prism_spray_t3b` | Spectrum Step | Cast also dashes you 6 m backward. |
| 45 | `sorcerer_prism_spray_t4a` | Rainbow Roar | Three sprays in a row over 1.2 s (charges up to 3, CD applies per charge). |
| 45 | `sorcerer_prism_spray_t4b` | Prism Stance | While Prism Spray is on cooldown, Flux Bolts split into a band's element pattern (3 hits, 45% each). |

### Unstable Orb
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `sorcerer_unstable_orb_t1a` | Anchored | The orb stays where you place it (ground target 30 m) for 6 s. |
| 12 | `sorcerer_unstable_orb_t1b` | Leashed | The orb orbits you at 4 m instead of travelling. |
| 12 | `sorcerer_unstable_orb_t1c` | Bouncing | The orb bounces off the first 2 enemies it touches, 60% SP per bounce. |
| 22 | `sorcerer_unstable_orb_t2a` | Gravity | Pulses pull enemies 1.5 m toward the orb. |
| 22 | `sorcerer_unstable_orb_t2b` | Twin Orbs | Fires two orbs at ±15°, 60% pulses each. |
| 32 | `sorcerer_unstable_orb_t3a` | Critical Mass | Every enemy the orb has pulsed adds +15% to the pop (cap +150%). |
| 32 | `sorcerer_unstable_orb_t3b` | Flux Core | If the pop happens with Flux ≥ 50, it triggers a Chaos roll and costs 50 Flux. |
| 45 | `sorcerer_unstable_orb_t4a` | Chain Reaction | The pop spawns 3 mini-orbs that each pulse 3 times. |
| 45 | `sorcerer_unstable_orb_t4b` | Ride the Orb | Recast teleports you to the orb before it pops. |

### Fortune's Shell
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `sorcerer_fortunes_shell_t1a` | Shared Luck | Cast on an ally within 30 m instead (their coin, your numbers). |
| 12 | `sorcerer_fortunes_shell_t1b` | Two-Headed Coin | Heads is 75%. |
| 22 | `sorcerer_fortunes_shell_t2a` | Edge Landing | 10% chance the coin lands on its edge: both results happen. |
| 22 | `sorcerer_fortunes_shell_t2b` | Mirror Coat | While the shell holds, 30% of spell damage taken is reflected at the caster. |
| 32 | `sorcerer_fortunes_shell_t3a` | Lucky Break | If a hit would kill you while the shell is on cooldown, you survive at 1 HP and the cooldown gains 30 s (once per 3 min). |
| 32 | `sorcerer_fortunes_shell_t3b` | Double or Nothing | Heads bursts twice (second at 150%), tails heals nothing and grants +40 Flux. |
| 45 | `sorcerer_fortunes_shell_t4a` | House Edge | The shell also cleanses one harmful magic effect on cast. |
| 45 | `sorcerer_fortunes_shell_t4b` | Rolling Shell | 2 charges. |

### Chance Maelstrom
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `sorcerer_chance_maelstrom_t1a` | Walking Storm | The circle follows your target at 3 m/s. |
| 12 | `sorcerer_chance_maelstrom_t1b` | Eye of the Storm | Becomes a 12 m donut around you; the 4 m middle is safe for you and allies. |
| 22 | `sorcerer_chance_maelstrom_t2a` | Loaded Clouds | Strikes cycle Ember → Rime → Spark → Hollow → Ember → Rime in order (a guaranteed Prismatic Burst). |
| 22 | `sorcerer_chance_maelstrom_t2b` | Downpour | 10 strikes of 45% SP instead of 6 of 70%. |
| 32 | `sorcerer_chance_maelstrom_t3a` | Updraft | Enemies inside are lifted 1 m (interrupting non-boss casts) on each Spark strike. |
| 32 | `sorcerer_chance_maelstrom_t3b` | Ungrounded | Channel can be walked at 40% speed. |
| 45 | `sorcerer_chance_maelstrom_t4a` | Perfect Storm | Prismatic Burst also resets Prism Spray and grants 30 Flux. |
| 45 | `sorcerer_chance_maelstrom_t4b` | Hanging Storm | The storm stays 6 s after your channel ends, striking every 1 s by itself. |

### The Sixfold Die
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `sorcerer_sixfold_die_t1a` | Weighted | Roll two dice, keep the higher face. |
| 12 | `sorcerer_sixfold_die_t1b` | Pair of Dice | Two dice of 5 m each at two points; each face × 80% SP. Doubles (same face) = both explode again. |
| 22 | `sorcerer_sixfold_die_t2a` | Sticky Pips | The crater stays 6 s, dealing (face × 10%) SP per second. |
| 22 | `sorcerer_sixfold_die_t2b` | Shockwave Face | Faces 4–6 knock enemies down for 1 s (not bosses). |
| 32 | `sorcerer_sixfold_die_t3a` | Rethrow | If the face is 1–2, you may recast within 3 s for free. |
| 32 | `sorcerer_sixfold_die_t3b` | Lucky Sevens | Face + the number of elements on your recent 6 casts = the multiplier (cap 9). |
| 45 | `sorcerer_sixfold_die_t4a` | Sky of Dice | Six dice fall over 3 s on six targets, each rolls separately. |
| 45 | `sorcerer_sixfold_die_t4b` | Called Shot | You name the face (click 1–6) — it lands as named, but the cooldown becomes 90 s. |

---

## 6. Rotation / how it plays

- **Solo (open world):** open with Unstable Orb through the pack, Prism Spray what gets close, Flux Bolt the rest.
  Fortune's Shell when anything reaches you. Flux releases usually come every 8–10 casts — save the Die for a champion.
- **Dungeon (5 players):** pull pack → Maelstrom on the tank's pile, Orb through, Spray between. On bosses:
  Flux Bolt as filler, hold Prism Spray and the Die for the element the boss is weak to (Nudge it in).
  Throw Mana Burn (talent) at gold-bordered casts when the interrupter is on cooldown.
- **Raid (10/20):** the Sorcerer is a moving spread-damage dealer. Keep the Wheel Mote colour visible for your
  healer (Hollow rolls mean you will not need their mana). Line up Die + Wild Crown + boss "vulnerable" phases.

**Priority on a single target:** Die (if face ≥ 4 likely via Weighted) › Maelstrom with Loaded Clouds › Prism Spray on the right element › Flux Bolt.

## 7. Boss mechanics

| Mechanic | Sorcerer answer |
|---|---|
| Element immunity (e.g. a fire boss) | The rider fails, damage lands as Wild at 80%. Nudge past Ember before big spells. |
| Adds that must die fast | Prism Spray + Unstable Orb with Gravity. |
| Soaks (orange) | Fortune's Shell before stepping in; tails heals the soak damage back. |
| Movement-heavy phases | Walking Cast (Flux Bolt t1a), Ungrounded (Maelstrom t3b), Chaos Blink. Cast times are the weakness. |
| Interrupts | Mana Burn talent only (1 per 20 s). Not a main interrupter. |
| Void zones | none cast by the class; the Die's crater (t2a) is enemy-only. |
| Chaos in a raid | Chaos Table effects never touch players, never pull, never move a boss. The joke results 1–2 do not roll in raids (QUESTIONS.md C13). Star Fall and Ember Rain only target enemies already in combat, so a Flux cannot pull a second pack. |

---

## 8. Class sets

Set slots: head, shoulders, chest, hands, legs, feet (page 08 owns slots). Six pieces each.

### `set_sorcerer_gamblers_regalia` — The Gambler's Regalia (levels 25–30)
Drops: bosses of `d07_thornheart` and `d08_moonwell_ruins` (Normal) — one piece per boss kill, 15% chance each; all six on Heroic.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Chaos Table results 1–2 are rerolled; each Flux also restores 4% Mana. | Flux |
| 4 | Prism Spray bands that roll the same element merge into one 40° band for +60% damage. | `sorcerer_prism_spray` |
| 6 | The Sixfold Die can never roll below 3. | `sorcerer_sixfold_die` |

### `set_sorcerer_vestments_of_the_broken_wheel` — Vestments of the Broken Wheel (level 60, raid)
Drops: `r04_ember_court` (Normal/Mythic), tokens from bosses 2, 4, 6, 8 (`b_kennelmaster_varro` Kennelmaster Varro, `b_forgequeen_hesta` Forge-Queen Hesta, `b_vaelkyr_emberwing` Vaelkyr, the Emberwing Consort, `b_ember_king_kaedros` Kaedros, the Ember King); the 6th piece from the Mythic-only vendor token.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Flux Bolt cast time −0.3 s; every 4th Flux Bolt carries two riders. | `sorcerer_flux_bolt` |
| 4 | Unstable Orb pulses add +3 Flux each; the pop always triggers a Chaos roll if Flux ≥ 60 (spends 60). | `sorcerer_unstable_orb` |
| 6 | Wild Crown (d20 = 20) now happens on 18–20; while crowned, Chance Maelstrom has no cooldown. | Flux, `sorcerer_chance_maelstrom` |

### `set_sorcerer_stormglass_robes` — Stormglass Robes (level 60, Mythic+)
Drops: any `d09`–`d14` Mythic+ end chest at key level 8+, 1 piece per chest (bad-luck protection per page 08).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Nudge gains a 3rd charge. | Wheel |
| 4 | Fortune's Shell always lands heads while you have 3 Nudge charges. | `sorcerer_fortunes_shell` |
| 6 | Each Nudge spent adds +8% damage to your next Wild spell (stacks to 3). | all |

---

## 9. Legendaries and uniques

| id | Name | Slot | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_the_crooked_die` | The Crooked Die | off hand (Effigy) | The Sixfold Die rolls **twice** and adds both faces (range 2–12 × 110% SP). | `b_ember_king_kaedros` Kaedros, the Ember King (`r04_ember_court` boss 8; Mythic 8%, Normal 3%) |
| `leg_wheelwrights_staff` | Wheelwright's Staff | staff | The Wheel shows the **next two** elements; Nudge moves either of them. | `b_oddrin_the_unmaker` Vell Oddrin, the Unmaker (`d12_unmade_workshop` end boss; Heroic/Mythic+ 4%) |
| `leg_crown_of_the_mad_magister` | Crown of the Mad Magister | head | Flux threshold 60 but the Chaos Table uses a d12 (results 9–20 shifted down; jokes removed). | `b_marchheart` The Marchheart, the Wildmarch Dreaming (`r05_veilspire` secret boss) |
| `leg_quadrant_bracers` | Quadrant Bracers | hands | Casting four Wild spells of four different elements in a row grants **Quadrant**: 8 s, +40% damage, the next Wild spell carries all four riders. | `b_unmoored` The Unmoored (`riftmarch` world boss, page 13 §8; weekly, 6%) |
| `leg_orb_of_second_chances` | Orb of Second Chances | off hand (Seer's Orb) | Unstable Orb can be **caught**: recast while touching it to throw it again (full 7 pulses), once per cast. | `b_pearl_twins` The Pearl Twins (`r03_sunken_choir` boss 5; 8%) |
| `uq_spinners_wand` | The Spinner's Wand | wand | +12% cast speed; each Hollow roll gives +1% cast speed for 10 s (stacks 10). | `b_king_sethar_unshattered` King Sethar the Unshattered (`d05_glass_tombs` end boss; Normal) |
| `uq_patchwork_hood` | Patchwork Hood | head | Chaos result "Wrong Hat" gives a random hat **and** +20% damage for 10 s. | `b_the_grindwheel` The Grindwheel (`d02_drowned_mill` end boss; Normal, 12%) |
| `uq_coinmaster_sash` | Coinmaster's Sash | legs | Fortune's Shell coin flip shows before the shell breaks; tails heals +50%. | `b_grief_in_iron` Grief-in-Iron (`greyridge` world boss, page 13 §8) |
| `uq_ember_rime_signet` | Ember-Rime Signet | ring | Consecutive Ember then Rime (or Rime then Ember) casts shatter: 100% SP bonus hit. | `b_rimeweaver_seidra` Rimeweaver Seidra (`d10_rimefang_caverns` boss 2) |

Legendary powers are data-driven effects in the shape Farhold already uses: `legendaryEffect` ids resolved in a registry
`(reuse: prototypes/farhold/js/effects.js, js/uniques.js — injected at load, the shared items.json is never written)`.

---

## 10. Voice and barks

- Timbre: `shared/voices.js` `voiceFor({ role: 'caster', gender, seed })`, pitch +8%, intonation 1.3 (sing-song, delighted). `(reuse)`
- Barks through Lingo (`lingo/`), tag `class:sorcerer`; 15 s anti-repeat.

| Event | Lines |
|---|---|
| Cast (big spell) | "Let's see what we get." · "Round and round…" · "Pick a colour. Any colour." |
| Flux release | "Oh — here it comes!" · "Hold onto something." · "Chaos, do your worst!" |
| Joke result (1–2) | "…That was on purpose." · "Nice hat, though." |
| Die face 6 | "SIX!" · "Read them and weep." |
| Die face 1 | "Loaded against me." · "It rolled funny." |
| Crit | "Beautiful." · "That's the one." |
| Low health (<30%) | "Bad luck — very bad luck!" · "Somebody, the odds are turning!" |
| Out of Mana | "The Wheel's run dry." |
| Element immune | "Doesn't like that colour. Noted." |

---

## 11. Reuse notes

| Wildmarch piece | Borrowed from | Notes |
|---|---|---|
| Flux Bolt look | Farhold `firebolt` / `chain_bolt` / `ice_lance` projectiles, `avatar-3d/js/spellfx.js` ELEMENTS | visuals only; numbers new |
| Unstable Orb | `storm_orbs` orb mesh (farhold `data/skills.json`) | recoloured each pulse |
| Maelstrom | `blizzard` / `toxic_cloud` ground pulse pattern (`repeats`) | the pulse engine is reused |
| Fortune's Shell | STATUS_FX `barrier` | gold tint |
| Wheel Mote | pet `storm_familiar` look (`js/pets.js` CLASS_PETS) | cosmetic only |
| Outfit | `avatar-3d/data/class-outfits.json` `sorcerer` | hood, high-collar robe, rune halo |
| Emberveil ideas | `wild_bolt`, `sorc_arcane_surge`, `mana_burn`, `chaos_ward` | ideas reborn as Flux Bolt, Wild Crown, the Mana Burn talent, Fortune's Shell |
