# Sorcerer — class design (`sorcerer`)

> *"I don't pick the element. I pick the moment. The Wheel picks the rest."*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Follows the class template in [page 00 §5](../00-OVERVIEW.md).
Canon facts used (page 00 §6): primary role **Damage**, hybrid role **Support**, build **caster**, **cloth** armour,
resource **Mana**, mechanic **Wild Magic — random element rolls, surges, the chaos table**, spell slots
**1 / 4 / 10 / 18 / 28 / 40**, calling quests **6 / 20 / 40**, talent tiers **12 / 22 / 32 / 45**, cap **60**.
Owner of this file: every `sorcerer_*` spell, talent, set, legendary, unique and soul.
Combat maths (spell power, crits, statuses, tags) are owned by [page 05](../05-COMBAT.md).

## How to read the numbers on this page

| Term | Meaning |
|---|---|
| **SP** | spell power. "120% SP" = 1.2 × your spell power, before crit and resist (page 05 owns the formula). The number is final: nothing multiplies it again |
| **Mana** | the sorcerer's resource. Pool = **100% base Mana** (≈2,400 at level 60, page 07). **Regenerates 1.2% of max per second in combat, 3% out of combat.** Costs are written as % of base maximum Mana so they scale with level. Builders: none — Mana only refills (plus the **Hollow** rider and a few Chaos results). Spenders: every spell (1.5%–12%) |
| **Flux** | the sorcerer's second gauge, 0–100 (§2.2). Built by Wild casts, spent automatically by a **Flux release**. The name is kept; it is not "Surge" (the mage's old Surge is now Overflow) |
| GCD | global cooldown 1.0 s after any spell, cut by haste to a 0.75 s floor |
| **Targeting** | page 02 / 00 §12.1 W8. **Needs target** = will not cast without a valid hard target. **Auto-target** = with no valid target it picks the valid enemy closest to your aim point in range (and may set it as your target — a setting). **Ground** = a placed circle. **Self**. **Ally** = a party member or yourself (`F1`–`F5` or their frames) |
| **Tags** | page 05 §Tags owns the list. A bonus to a tag applies to every spell carrying it; a bonus naming two tags needs both. A Wild spell carries the **element tag of the element it rolled** (`tag_fire`, `tag_ice`, `tag_lightning` or `tag_arcane`) for that cast only |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A caster who never learned control — they learned to *ride* the chaos. Every spell comes out in a random element; the skill is in timing, reading the Wheel and cashing in Flux. |
| Primary role | **Damage** (ranged, burst-and-spread) |
| Hybrid role | **Support** — the **Boon Table** turns the chaos outward: riders and Flux releases become party buffs (§5) |
| Build | caster |
| Armour | cloth (robes, hoods, pointed shoes) |
| Weapons | staff (two hands) or wand + focus (off hand: Grimoire / Seer's Orb / Effigy) `(reuse: prototypes/farhold/js/foci.js)` |
| Primary attribute | INT |
| Resource | **Mana** + the **Flux** gauge |
| Companion | **Wheel Mote** — a fist-sized floating spark that orbits the sorcerer's head and takes the colour of the next element on the Wheel. Cosmetic and a readable tell for other players; it does not fight (except Chaos result 16). Not a pet: it takes no party slot, cannot die and never counts for anything `(reuse: storm_familiar look, farhold/js/pets.js, recoloured)` |
| Starting kit | Apprentice's Wand, cloth robe, cloth hood, 1 spell (`sorcerer_flux_bolt`) |

**Playstyle in three sentences.** Cast Flux Bolt to spin the Wheel and fill Flux. Watch the next element and
fire your big spells when it is the one you want (or Nudge it there). When Flux reaches 100 the Chaos Table
rolls a d20 on top of your spell — and a Support sorcerer rolls the Boon Table instead, spraying buffs on the party.

---

## 2. Class mechanic — Wild Magic (the Wild Wheel)

Every **Wild** spell (all six are Wild) is cast in an element chosen by the Wheel, not by you.

### 2.1 The four elements of the Wheel

| Segment | Element (spellfx) | Tag | Rider added to every hit of a Wild spell | Colour |
|---|---|---|---|---|
| **Blaze** | `fire` | `tag_fire` | *Scorched*: 30% SP extra fire damage over 4 s (a tick every 1 s) | orange |
| **Rime** | `ice` | `tag_ice` | *Rimed*: 25% slow for 3 s. Bosses: no slow; instead +5% crit chance for the sorcerer against it for 3 s | pale blue |
| **Spark** | `lightning` | `tag_lightning` | *Arced*: the hit jumps to 1 more enemy within 8 m for 40% of its damage | yellow |
| **Hollow** | `arcane` | `tag_arcane` | *Hollowed*: you regain Mana equal to 0.5% of max per enemy hit (cap 3% per cast) | violet |

- A spell takes the element **under the pointer when the cast finishes** (not when it starts). After each
  Wild cast the Wheel spins to a new random segment (it can land on the same one: 25%).
- **Immunities:** if the target is immune to the rolled element, the rider is lost and the base damage lands
  as *Wild* (untyped) damage at 80%, carrying **no element tag**. A sorcerer never does zero damage to
  anything. (Boss tooltips list immunities — page 11.)

### 2.2 Flux and the Chaos Table

- Every Wild cast adds Flux: **+8** (Flux Bolt), **+12** (other spells), **+4 per extra enemy hit** (cap +20 per cast).
- At **100 Flux** your next cast finishes with a **Flux release**: the Chaos Table rolls a d20 and the result
  happens on top of the spell. Flux resets to 0. Flux drains 5 per second after 10 s out of combat.
- **The Chaos Table never harms another player, never kills you, never pulls a second pack and never moves a
  boss.** Results 1–2 are harmless jokes. In **Challenge mode** a 1 or 2 is rolled again (once), so a
  Challenge run never loses a release to a joke (QUESTIONS.md C13).
- Area results (8, 10, 19) only pick enemies **already in combat with your party**.

| d20 | Result | Effect in numbers |
|---|---|---|
| 1 | Confetti | Coloured sparks burst from you. Nothing else. A bark plays. |
| 2 | Wrong Hat | Your hat becomes a random other hat for 60 s (cosmetic). +5 Flux. |
| 3 | Mana Spill | Regain 10% of max Mana. |
| 4 | Doubled | The spell is cast a second time for free, same target, 60% power. |
| 5 | Side Step | You teleport 8 m in the direction you are moving (or backward if standing still). |
| 6 | Quickened | +30% cast speed for 6 s. |
| 7 | Wound Clock | All of your spell cooldowns drop by 3 s. |
| 8 | Fire Rain | 5 fire bolts fall on random enemies within 20 m, 60% SP fire each, 2 m radius. |
| 9 | Rime Nova | 8 m ring around you, 80% SP ice, Rime rider. |
| 10 | Chain Storm | A lightning bolt chains through 6 enemies within 12 m, 70% SP each. |
| 11 | Hollow Well | A 5 m violet pool at your feet for 8 s: allies inside regain 1% max Mana per second (Tempo / Momentum users: 3 points per second). |
| 12 | Four-Fold | The next 4 Wild casts each get **all four** riders. |
| 13 | Glass Skin | Barrier on you: 20% of your max health for 8 s. |
| 14 | Echo Wheel | For 8 s every Wild cast rolls twice and applies both riders. |
| 15 | Ricochet | Your next 3 Flux Bolts bounce to 2 extra enemies at 60%. |
| 16 | Wild Familiar | The Wheel Mote fights for 10 s: fires a 70% SP bolt every 1 s at your target. |
| 17 | Refund | This cast cost nothing and its cooldown is reset. |
| 18 | Borrowed Luck | +25% crit chance for 6 s. |
| 19 | Sky Stone | 6 s later a 7 m stone crashes on your target: 400% SP Wild damage (a red danger zone to *enemies*, a gold ring to allies). |
| 20 | **Wild Crown** | For 8 s every Wild spell deals +50% and its Flux gain is doubled. The screen edge glows prismatic. |

(Renamed in round 2: result 5 → **Side Step** and result 19 → **Sky Stone** (their old names are on the banned
list, 00 §12.5), *Ember Rain* → **Fire Rain**, the Wheel's *Ember* segment → **Blaze**.)

### 2.3 The gauge (HUD)

- A **ring of four coloured segments** (Blaze / Rime / Spark / Hollow) left of the spell bar, 64 px. A white
  **pointer** shows the next element. The Wheel Mote over your head matches it, so allies can read it too.
- A thin **Flux arc** wraps the ring, filling clockwise 0 → 100; at 90+ it flickers.
- The ring's centre shows **"RUIN"** (red) or **"BOON"** (green) for the table you are rolling (§5).
- The last Chaos or Boon result shows as an icon + name in the ring's centre for 3 s, and in the combat log (page 03 `scr_combat_log`).
- **Nudge charges** (from Calling 20) are two pips under the ring.
- The Mana bar sits under the spell bar as usual (page 03).

### 2.4 Calling quests (page 14 owns the quest text)

| Level | Quest id | What you do (summary) | What it grants |
|---|---|---|---|
| 1 | — | — | Elements roll at random. **No gauge, no preview**, no Flux. |
| 6 | `q_calling_sorcerer_1` | Hearthvale: collect 4 "stray sparks" by killing things with each of the four elements, then read the Cracked Wheel in the old mill. NPC `npc_magister_orlo_quint`. | The **Wild Wheel gauge**, the next-element preview, **Flux**, the Chaos Table **and the Boon Table** (the Support switch, §5). |
| 20 | `q_calling_sorcerer_2` | Sunscar: survive the "Wild Storm" event at a glass tomb while the Wheel spins every 0.5 s; land 20 hits in a row without a miss. | **Nudge** (class key **`Q`**, page 02 §5.16): push the pointer one segment clockwise. 2 charges, 1 charge per 12 s, off the GCD. Chaos results 1–2 are rolled again once everywhere (not only in Challenge mode). |
| 40 | `q_calling_sorcerer_3` | Drowned Coast → Riftmarch: steal a die from a drowned gambler-spirit, win three rolls against it (a dialog opportunity: bet, bluff or cheat), then shatter it at a rift. | **Chosen Chaos**: at each Flux release you see **three** rolled results as cards for 2 s and click one (default: the highest). The Flux threshold drops to 80. Works on both tables. |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Lvl | id | Name | Cost | CD | Cast | Targeting | Range / shape | Tags | Main number |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `sorcerer_flux_bolt` | Flux Bolt | 1.5% Mana | — | 1.4 s | Auto-target | 38 m bolt, 1.2 m splash | `tag_spell` `tag_ranged` `tag_projectile` + element | 120% SP + rider |
| 2 | 4 | `sorcerer_prism_spray` | Prism Spray | 4% Mana | 8 s | instant | Auto-target (aims the cone) | 9 m, 60° cone in 3 bands | `tag_spell` `tag_area` + element per band | 3 × 75% SP |
| 3 | 10 | `sorcerer_unstable_orb` | Unstable Orb | 6% Mana | 14 s | instant | Auto-target (fires toward it) | moving orb, 20 m, 3 m pulses | `tag_spell` `tag_projectile` `tag_area` `tag_duration` + element per pulse | 7 × 45% SP + 180% SP pop |
| 4 | 18 | `sorcerer_fortunes_shell` | Fortune's Shell | 5% Mana | 30 s | instant, off GCD | Self (Ally with Shared Luck / Boon) | self | `tag_spell` `tag_shield` `tag_duration` | 25% max HP barrier |
| 5 | 28 | `sorcerer_chance_maelstrom` | Chance Maelstrom | 10% Mana | 24 s | 3 s channel | Ground | 32 m, 7 m circle | `tag_spell` `tag_area` `tag_channel` + element per strike | 6 × 70% SP |
| 6 | 40 | `sorcerer_sixfold_die` | The Sixfold Die | 12% Mana | 60 s | 1.5 s | Ground | 40 m, 8 m circle | `tag_spell` `tag_area` + element | face × 110% SP |

### 3.2 Details

**`sorcerer_flux_bolt` — Flux Bolt** (slot 1, level 1) `(new)`
- 1.5% Mana · no cooldown · 1.4 s cast (standing still; the Walking Cast talent lets you move) · 38 m · bolt, 1.2 m splash.
- Targeting: **Auto-target** — your hard target if valid; otherwise the enemy nearest your aim point.
- Tags: `tag_spell` `tag_ranged` `tag_projectile` + the rolled element's tag.
- 120% SP in the Wheel's element + that element's rider. +8 Flux.
- Look: `spellfx` projectile of the rolled element (`fire` cone / `ice` shards / `lightning` bolt / `arcane` helix), a ring of the other three colours flickering around it. Sound: `sfx` `launch_<element>` pitched up 10%, a roulette-wheel tick on release.

**`sorcerer_prism_spray` — Prism Spray** (slot 2, level 4) `(new)`
- 4% Mana · 8 s · instant · 9 m · 60° cone split into **three 20° bands**; the Wheel rolls **three times at once**, one element per band (left, middle, right — shown on the Wheel as three pointers for 0.5 s).
- Targeting: **Auto-target** — the cone turns toward your hard target, or toward the enemy nearest your aim point; with none in 9 m it fires where you face.
- Tags: `tag_spell` `tag_area` + each band's element tag.
- Each band: 75% SP + its rider. An enemy on a band border is hit by both (max 2 bands). +12 Flux.
- Look: a fan of three coloured streams (spellfx `cone` in each element's palette). Sound: three overlapping `launch` sounds, a glassy chord.

**`sorcerer_unstable_orb` — Unstable Orb** (slot 3, level 10) `(new)`
- 6% Mana · 14 s · instant · fires a 1 m orb that drifts **4 m/s** toward the target, up to 20 m (5 s).
- Targeting: **Auto-target** (aims at the target; flies straight — it does not steer).
- Tags: `tag_spell` `tag_projectile` `tag_area` `tag_duration` + each pulse's element.
- Every 0.7 s it pulses 45% SP in 3 m, **re-rolling its element each pulse** (its colour changes). 7 pulses.
- **Recast** (press again) to pop it early, or it pops at the end: 180% SP in 6 m in its current element.
- +12 Flux on cast, +2 per pulse that hits. Look: a wobbling sphere of shifting colour with arcs of the next colour crawling over it (spellfx `arcane` helix trail + element impact per pulse). Sound: a low humming loop that rises in pitch; `impact_<element>` on pop.

**`sorcerer_fortunes_shell` — Fortune's Shell** (slot 4, level 18) `(new)` — the defensive cooldown
- 5% Mana · 30 s · instant, off the GCD.
- Targeting: **Self**. With the talent *Shared Luck* or while rolling the **Boon Table**: **Ally** (`F1`–`F5` or a party frame; 30 m).
- Tags: `tag_spell` `tag_shield` `tag_duration`.
- Barrier: 25% of the wearer's max health for 6 s. When it breaks **or** expires, flip a coin (shown over their head):
  - *Heads* (50%): the shell bursts outward — 150% SP Wild damage in 5 m and knocks enemies back 4 m (bosses: no knockback).
  - *Tails* (50%): the wearer heals for the barrier's remaining value + 10% of max health.
- Look: a translucent gold coin-faced sphere (STATUS_FX `barrier` recoloured gold); the coin spins over the head. Sound: coin flip + chime.

**`sorcerer_chance_maelstrom` — Chance Maelstrom** (slot 5, level 28) `(new)`
- 10% Mana · 24 s · 3 s channel (you can turn, not move) · **Ground**, up to 32 m · 7 m circle.
- Tags: `tag_spell` `tag_area` `tag_channel` + each strike's element.
- 6 strikes, one every 0.5 s, each 70% SP in the circle, each in a **freshly rolled element** with its rider.
- If one channel lands **all four** elements, the circle ends with a **Prismatic Burst**: 150% SP to everything inside (chance with 6 random rolls ≈ 38%; Nudge and talents raise it).
- +12 Flux, +2 per strike that hits. Look: a swirling many-coloured cloud with bolts of each element falling from it. Sound: `ambience` storm loop, `impact_<element>` per strike, a bell on Prismatic Burst.

**`sorcerer_sixfold_die` — The Sixfold Die** (slot 6, level 40) `(new)`
- 12% Mana · 60 s · 1.5 s cast · **Ground**, up to 40 m · 8 m circle. A giant six-sided die of the Wheel's element falls, lands after 1.0 s and rolls.
- Tags: `tag_spell` `tag_area` + the rolled element.
- Damage = **face × 110% SP** in the circle (1 → 110%, 6 → 660%; average 385%) + the rider.
- Face 6: also fills Flux to 100. Face 1: the die cracks into 3 small dice that fall on 3 random enemies within 12 m for 110% SP each (a 1 is never a waste).
- Party members see the falling die as a gold ring (no danger to them); enemies' AI sees a red danger zone.
- Look: a 2 m die built from the element's shapes (flame cone, shards, bolts, helix) with pips of light; the rolled face glows over the crater for 2 s. Sound: wooden clatter scaled up to a thunderclap.

### 3.3 Rotation / how it plays

- **Solo (open world):** open with Unstable Orb through the pack, Prism Spray what gets close, Flux Bolt the rest. Fortune's Shell when anything reaches you. Flux releases come every 8–10 casts — save the Die for a champion or rare.
- **Dungeon (5 players):** pull → Maelstrom on the tank's pile, Orb through, Spray between. On bosses: Flux Bolt as filler; hold Prism Spray and the Die for the element the boss is weak to (Nudge it in). Throw Mana Burn (talent) at gold-bordered casts when the interrupter is on cooldown. Line up Die + Wild Crown + the boss's "vulnerable" phase.
- **Single-target priority:** Die (face ≥ 4 likely with Weighted) › Maelstrom with Loaded Clouds › Prism Spray on the right element › Flux Bolt.
- **Mana:** a damage sorcerer spends ≈2.6% Mana per second while casting on cooldown against 1.2% regeneration plus Hollow refunds (≈0.5%/s): a full bar lasts about **110 s** of flat-out casting, so long fights need Hollow rolls, Mana Spill and potions.

### 3.4 Boss mechanics

| Mechanic | Sorcerer answer |
|---|---|
| Element immunity (e.g. a fire boss) | The rider fails, damage lands as Wild at 80%. Nudge past Blaze before big spells. |
| Adds that must die fast | Prism Spray + Unstable Orb with Gravity. |
| Soaks (orange) | Fortune's Shell before stepping in; tails heals the soak damage back. |
| Movement-heavy phases | Walking Cast (Flux Bolt t1a), Ungrounded (Maelstrom t3b), Chaos Side Step. Cast times are the weakness. |
| Interrupts | Mana Burn talent only (1 per 20 s). Not a main interrupter. |
| Void zones | none cast by the class; the Die's crater (t2a) hurts enemies only. |
| Chaos in a group | Chaos results never touch players, never pull, never move a boss; area results pick only enemies already in combat. |

---

## 4. Alternate spells

The sorcerer has no forms. Two things swap spells for a short time:

| Trigger | Spell replaced | Replacement | Numbers |
|---|---|---|---|
| Chaos **Wild Crown** (d20 = 20) active | Flux Bolt | **Crowned Bolt** `sorcerer_crowned_bolt` | instant, Auto-target, 150% SP, all four riders, 1% Mana. Tags as Flux Bolt + all four element tags |
| Calling 40 + holding Flux ≥ 80 for 3 s without spending | Prism Spray | **Prism Wall** `sorcerer_prism_wall` | Ground, 20 m: a 12 m wide, 3 m tall wall of 3 elements for 6 s; enemies crossing it take 120% SP + the band's rider. Tags `tag_spell` `tag_area` `tag_duration` + elements. Then Prism Spray returns |

Both show a glowing border on the slot and a one-line card the first time (page 03).

---

## 5. The hybrid role — Support (the Boon Table)

**Role focus.** The sorcerer uses the canon **Role focus** switch (00 §6: in the spellbook `K`, out of combat
only, saved per Loadout). Setting it to **Hybrid** turns on the **Boon Table** (the switch is also shown on the
Wheel's panel; 3 s to swap; it unlocks with the gauge at Calling 6), and the Dungeon Finder then queues the
sorcerer as **Support** (a Damage slot, 00 §4).

**While the Boon Table is on:**

| Piece | What changes |
|---|---|
| Your damage | **−20%** on every Wild spell (the chaos is pointed outward) |
| **Boon riders** | every Wild cast that hits also gives the **party member nearest the target** (or nearest you, for self-centred casts) a boon matching the rolled element — **Blaze** +8% damage for 6 s; **Rime** a barrier of 6% max health for 6 s; **Spark** +10% attack and cast speed for 6 s; **Hollow** 1.5% max Mana (Tempo / Momentum users: 6 points). A party member can hold one boon of each element at once; re-applying refreshes. Tags: the boon carries `tag_duration` (and `tag_shield` for Rime) |
| Fortune's Shell | becomes **Ally**-targeted (30 m) without the talent; heads bursts around the ally, tails heals the ally |
| Prism Spray | each band that passes over a party member gives them that band's boon too (up to 3 boons per cast) |
| Chance Maelstrom | party members standing in the circle get the boon of every strike (up to 6 refreshes) |
| Flux release | rolls the **Boon Table** below instead of the Chaos Table |

**The Boon Table** (d20; every result helps the party; "party" = party members within 30 m of you):

| d20 | Result | Effect in numbers |
|---|---|---|
| 1 | Warm Glow | The party heals 3% of max health. |
| 2 | Lucky Coin | One random party member: +10% crit chance for 6 s. |
| 3 | Mana Spring | The party regains 5% max Mana (Tempo / Momentum: 15 points). |
| 4 | Quickstep | The party moves 20% faster for 6 s. |
| 5 | Rimeguard | The party gets a barrier of 8% max health for 8 s. |
| 6 | Sparkhands | The party gets +12% attack and cast speed for 6 s. |
| 7 | Blazing Arms | The party deals +10% damage for 8 s. |
| 8 | Clean Slate | Removes one harmful magic effect from each party member. |
| 9 | Turned Hourglass | The party member with the longest spell cooldown running has it cut by 10 s. |
| 10 | Second Wind | The lowest-health party member heals 25% of max health. |
| 11 | Hollow Well | As Chaos 11. |
| 12 | Four-Fold Boon | Your next 4 Wild casts give **all four** boons. |
| 13 | Glass Skins | Every party member gets a barrier of 12% max health for 8 s. |
| 14 | Echo Boon | For 8 s every Wild cast gives two boons (rolled twice). |
| 15 | Luck Shared | The party gets +15% crit chance for 6 s. |
| 16 | Mote Mender | The Wheel Mote heals the lowest-health party member for 60% SP every 1 s for 8 s. |
| 17 | Refund | This cast cost nothing and its cooldown is reset. |
| 18 | Steady Feet | The party cannot be knocked back or down for 6 s and takes 10% less damage. |
| 19 | Fate Deferred | For 8 s, the next hit that would kill each party member leaves them at 1 health instead (once each). |
| 20 | **Boon Crown** | For 10 s every boon is doubled (+16% damage, 12% barrier, +20% speed, 3% Mana) and your Flux gain is doubled. |

**Talents that help:** Fortune's Shell t1a *Shared Luck* (Ally targeting even on the Ruin table), t2a *Edge
Landing*, t4a *House Edge* (cleanse); Prism Spray t1b *Full Circle* (bands around you, so boons reach a stack);
Chance Maelstrom t1b *Eye of the Storm*; Flux Bolt t3a *Loaded* (steer toward Hollow for Mana).
**Gear:** the Wild Pact set piece bonuses (§8) and the soul `soul_lucky_patron` (§9).

**How good it is.** Against the bard (the primary Support), a Boon sorcerer gives about **70% of the bard's
steady party uptime** — a boon on 1–3 party members per cast, not a song on everyone — but with bigger random
spikes (Boon Crown, Glass Skins, Fate Deferred). It keeps 80% of its own damage. That is strong in the **open
world, Normal dungeons and Depth up to about 10**. In **Challenge mode** the randomness is the weakness: a
Challenge group cannot plan a group-wide cooldown around a d20, so Fate Deferred and Glass Skins are a bonus,
not a plan.

---

## 6. Utility spells

None. The sorcerer has no travel or ritual spells; it uses scrolls and the Recall Stone ([page 20](../20-TRAVEL.md)).

---

## 7. Talents

One pick per tier. Tiers open at **12 / 22 / 32 / 45** (a tier opens at its level or when the spell unlocks,
whichever is later). Ids `<spellid>_t<tier><a|b|c>`. Engine: per-skill talent trees
`(reuse: prototypes/farhold/js/skilltalents.js — one node per tier, text built from the node's numbers)`.
A talent that adds a shape adds its tag (a line adds nothing; a puddle adds `tag_area` `tag_duration`).

### Flux Bolt
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `sorcerer_flux_bolt_t1a` | Walking Cast | Can be cast while moving at 60% speed; cast time 1.6 s. |
| 12 | `sorcerer_flux_bolt_t1b` | Split Flux | Fires 2 bolts in a 10° fan, 70% SP each, different elements. |
| 22 | `sorcerer_flux_bolt_t2a` | Mana Burn | Against an enemy with mana: burns 5% of its mana and deals +1% damage per 1% burned; interrupts a gold-bordered cast once per 20 s. |
| 22 | `sorcerer_flux_bolt_t2b` | Residue | The impact leaves a 2 m puddle of its element for 4 s (45% SP per s + rider). Adds `tag_area` `tag_duration`. |
| 32 | `sorcerer_flux_bolt_t3a` | Loaded | Every 5th Flux Bolt is instant and lands on the element of your choice (a free Nudge). |
| 32 | `sorcerer_flux_bolt_t3b` | Counterspark | A Flux Bolt that crits adds +10 Flux instead of +8. |
| 32 | `sorcerer_flux_bolt_t3c` | Tracer | The bolt turns toward the target through up to 90°. |
| 45 | `sorcerer_flux_bolt_t4a` | Conduit | Becomes a 1.4 s channelled beam, 26 m, 4 ticks of 45% SP, re-rolling its element each tick. Adds `tag_channel`, loses `tag_projectile`. |
| 45 | `sorcerer_flux_bolt_t4b` | Wild Barrage | Holding the key fires a new bolt each 0.9 s (instant each, 2% Mana each) up to 6 in a row. |

### Prism Spray
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `sorcerer_prism_spray_t1a` | Narrow Prism | Becomes a 16 m line, 3 m wide, all three elements stacked on every target. |
| 12 | `sorcerer_prism_spray_t1b` | Full Circle | Becomes a 6 m ring around you, three 120° bands. |
| 22 | `sorcerer_prism_spray_t2a` | Scatterlight | Enemies hit by 2 bands are knocked back 5 m (not bosses). |
| 22 | `sorcerer_prism_spray_t2b` | Glass Scatter | Each band leaves a 1 s after-image that hits again for 30%. |
| 32 | `sorcerer_prism_spray_t3a` | Colour Match | If two or three bands roll the same element, that band's damage is doubled. |
| 32 | `sorcerer_prism_spray_t3b` | Spectrum Step | The cast also dashes you 6 m backward. Adds `tag_movement`. |
| 45 | `sorcerer_prism_spray_t4a` | Rainbow Roar | 3 charges; three sprays in a row over 1.2 s. |
| 45 | `sorcerer_prism_spray_t4b` | Prism Stance | While Prism Spray is on cooldown, Flux Bolts split into three band elements (3 hits, 45% each). |

### Unstable Orb
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `sorcerer_unstable_orb_t1a` | Anchored | Becomes **Ground**-targeted: the orb stays where you place it (30 m) for 6 s. |
| 12 | `sorcerer_unstable_orb_t1b` | Leashed | Becomes **Self**: the orb circles you at 4 m instead of travelling. |
| 12 | `sorcerer_unstable_orb_t1c` | Bouncing | The orb bounces off the first 2 enemies it touches, 60% SP per bounce. |
| 22 | `sorcerer_unstable_orb_t2a` | Gravity | Pulses pull non-boss enemies 1.5 m toward the orb. |
| 22 | `sorcerer_unstable_orb_t2b` | Twin Orbs | Fires two orbs at ±15°, 60% pulses each. |
| 32 | `sorcerer_unstable_orb_t3a` | Critical Mass | Every enemy the orb has pulsed adds +15% to the pop (cap +150%). |
| 32 | `sorcerer_unstable_orb_t3b` | Flux Core | If the pop happens with Flux ≥ 50, it triggers a release and costs 50 Flux. |
| 45 | `sorcerer_unstable_orb_t4a` | Chain Reaction | The pop spawns 3 mini-orbs that each pulse 3 times. |
| 45 | `sorcerer_unstable_orb_t4b` | Ride the Orb | Recast teleports you to the orb before it pops. Adds `tag_movement`. |

### Fortune's Shell
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `sorcerer_fortunes_shell_t1a` | Shared Luck | Becomes **Ally**-targeted (30 m): their coin, your numbers. |
| 12 | `sorcerer_fortunes_shell_t1b` | Two-Headed Coin | Heads is 75%. |
| 22 | `sorcerer_fortunes_shell_t2a` | Edge Landing | 10% chance the coin lands on its edge: both results happen. |
| 22 | `sorcerer_fortunes_shell_t2b` | Mirror Coat | While the shell holds, 30% of spell damage taken is reflected at the caster. |
| 32 | `sorcerer_fortunes_shell_t3a` | Lucky Break | If a hit would kill you while the shell is on cooldown, you survive at 1 health and the cooldown gains 30 s (once per 3 min). |
| 32 | `sorcerer_fortunes_shell_t3b` | Double or Nothing | Heads bursts twice (second at 150%); tails heals nothing and grants +40 Flux. |
| 45 | `sorcerer_fortunes_shell_t4a` | House Edge | The shell also removes one harmful magic effect on cast. |
| 45 | `sorcerer_fortunes_shell_t4b` | Rolling Shell | 2 charges. |

### Chance Maelstrom
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `sorcerer_chance_maelstrom_t1a` | Walking Storm | The circle follows your hard target at 3 m/s (needs one: becomes **Needs target**). |
| 12 | `sorcerer_chance_maelstrom_t1b` | Eye of the Storm | Becomes a 12 m donut around you (**Self**); the 4 m middle is safe for you and allies. |
| 22 | `sorcerer_chance_maelstrom_t2a` | Loaded Clouds | Strikes cycle Blaze → Rime → Spark → Hollow → Blaze → Rime in order (a guaranteed Prismatic Burst). |
| 22 | `sorcerer_chance_maelstrom_t2b` | Downpour | 10 strikes of 45% SP instead of 6 of 70%. |
| 32 | `sorcerer_chance_maelstrom_t3a` | Updraft | Each Spark strike lifts non-boss enemies inside 1 m, interrupting their casts. |
| 32 | `sorcerer_chance_maelstrom_t3b` | Ungrounded | The channel can be walked at 40% speed. |
| 45 | `sorcerer_chance_maelstrom_t4a` | Perfect Storm | Prismatic Burst also resets Prism Spray and grants 30 Flux. |
| 45 | `sorcerer_chance_maelstrom_t4b` | Hanging Storm | The storm stays 6 s after your channel ends, striking every 1 s by itself. |

### The Sixfold Die
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `sorcerer_sixfold_die_t1a` | Weighted | Roll two dice, keep the higher face. |
| 12 | `sorcerer_sixfold_die_t1b` | Pair of Dice | Two 5 m dice at two points; each face × 80% SP. Doubles (same face) = both burst again. |
| 22 | `sorcerer_sixfold_die_t2a` | Sticky Pips | The crater stays 6 s, dealing (face × 10%) SP per second. Adds `tag_duration`. |
| 22 | `sorcerer_sixfold_die_t2b` | Shockwave Face | Faces 4–6 knock enemies down for 1 s (not bosses). |
| 32 | `sorcerer_sixfold_die_t3a` | Rethrow | If the face is 1–2, you may recast within 3 s for free. |
| 32 | `sorcerer_sixfold_die_t3b` | Lucky Sevens | Face + the number of different elements in your last 6 casts = the multiplier (cap 9). |
| 45 | `sorcerer_sixfold_die_t4a` | Sky of Dice | Six dice fall over 3 s on six enemies, each rolls separately (Auto-target picks them). |
| 45 | `sorcerer_sixfold_die_t4b` | Called Shot | You name the face (click 1–6) and it lands as named, but the cooldown becomes 90 s. |

---

## 8. Class sets

Set slots: head, shoulders, chest, hands, legs, feet (page 08 owns slots). Six pieces each.

### `set_sorcerer_gamblers_regalia` — The Gambler's Regalia (levels 25–30, dungeon set)
Drops from the bosses of `d07_thornheart` and `d08_moonwell_ruins` on **Normal** (15% per boss kill, at the
dungeon's level) and on **Challenge** (item level 60). Depth runs of those two dungeons can drop it too (page 12).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Chaos results 1–2 are rolled again; each Flux release also restores 4% Mana. | Flux |
| 4 | Prism Spray bands that roll the same element merge into one 40° band for +60% damage. | `sorcerer_prism_spray` |
| 6 | The Sixfold Die can never roll below 3. | `sorcerer_sixfold_die` |

### `set_sorcerer_broken_wheel` — Vestments of the Broken Wheel (level 60, endgame set)
Item level 60. Drops from **Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per boss;
page 12 names which boss drops which piece) and from the **end chest of any dungeon at Depth 10 or deeper**
(one random piece, 8%). *(Was a raid set; raids are in `WISHLIST.md`.)*

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Flux Bolt cast time −0.3 s; every 4th Flux Bolt carries two riders. | `sorcerer_flux_bolt` |
| 4 | Unstable Orb pulses add +3 Flux each; the pop always triggers a release if Flux ≥ 60 (spends 60). | `sorcerer_unstable_orb` |
| 6 | Wild Crown (and Boon Crown) happen on 18–20; while crowned, Chance Maelstrom has no cooldown. | Flux, `sorcerer_chance_maelstrom` |

### `set_sorcerer_wild_pact` — The Wild Pact (level 60, Support set)
Item level 60. **Crafted** by Tailoring (page 19; recipe from the Lantern House quartermaster at Trusted,
page 07) — each piece needs one **Tear-glass shard**, which drops from Depth 5+ end chests and from world
bosses of `riftmarch` and `kingsfire` (page 13). *(Replaces the old Stormglass Robes, which dropped from the removed key system; Depth replaced it.)*

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Nudge gains a 3rd charge; boons last 8 s instead of 6 s. | Wheel, Boon riders |
| 4 | Fortune's Shell always lands heads while you have 3 Nudge charges; on an ally, heads also gives them the Blaze boon. | `sorcerer_fortunes_shell` |
| 6 | Each Nudge spent makes your next Wild spell's boon reach **two** party members (and adds +8% damage to it). | all |

---

## 9. Class legendaries, uniques and souls

Legendary powers are data-driven effects in the shape Farhold already uses: `legendaryEffect` ids resolved in a
registry `(reuse: prototypes/farhold/js/effects.js, js/uniques.js — injected at load; the shared items.json is never written)`.

### Legendaries
| id | Name | Slot | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_the_crooked_die` | The Crooked Die | off hand (Effigy) | The Sixfold Die rolls **twice** and adds both faces (range 2–12 × 110% SP). | `b_fire_king_kaedros` Kaedros, the Fire King (`d15_fire_court` end boss), Challenge 6%, Normal 2% |
| `leg_wheelwrights_staff` | Wheelwright's Staff | staff | The Wheel shows the **next two** elements; Nudge moves either of them. | `b_oddrin_the_unmaker` Vell Oddrin, the Unmaker (`d12_unmade_workshop` end boss), Challenge 4%, its Depth end chest 2% |
| `leg_crown_of_the_mad_magister` | Crown of the Mad Magister | head | Flux threshold 60, but the table uses a d12 (results 9–20 shifted down; jokes removed). | `b_marchheart` The Marchheart (`d16_the_spire` secret boss; page 12 owns the fight) |
| `leg_quadrant_bracers` | Quadrant Bracers | hands | Casting four Wild spells of four different elements in a row grants **Quadrant**: 8 s, +40% damage, the next Wild spell carries all four riders (Boon: all four boons). | `b_unmoored` The Unmoored (`riftmarch` world boss, page 13), once a week per character, 6% |
| `leg_orb_of_second_chances` | Orb of Second Chances | off hand (Seer's Orb) | Unstable Orb can be **caught**: recast while touching it to throw it again (full 7 pulses), once per cast. | the world boss of `drowned_coast` (page 13), once a week, 6% *(was a raid drop)* |

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_spinners_wand` | The Spinner's Wand | wand | +12% cast speed; each Hollow roll gives +1% cast speed for 10 s (stacks 10). | `b_king_sethar_unshattered` King Sethar the Unshattered (`d05_glass_tombs` end boss) |
| `uq_patchwork_hood` | Patchwork Hood | head | Chaos "Wrong Hat" gives a random hat **and** +20% damage for 10 s. | `b_the_grindwheel` The Grindwheel (`d02_drowned_mill` end boss), 12% |
| `uq_coinmaster_sash` | Coinmaster's Sash | legs | Fortune's Shell's coin shows before the shell breaks; tails heals +50%. | `b_grief_in_iron` Grief-in-Iron (`greyridge` world boss, page 13) |
| `uq_blaze_rime_signet` | Blaze-and-Rime Signet | ring | Consecutive Blaze then Rime (or Rime then Blaze) casts shatter: a 100% SP bonus hit. | `b_rimeweaver_seidra` Rimeweaver Seidra (`d10_rimefang_caverns` boss 2) |

(Renamed: `uq_ember_rime_signet` Ember-Rime Signet → `uq_blaze_rime_signet` **Blaze-and-Rime Signet**.)

### Souls
A soul goes in a **Soul** socket (page 08) and adds a behaviour. Both need the wearer to be a **sorcerer**.

| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_loaded_bones` | Soul of the Loaded Bones | weapon | class: sorcerer | Every Flux release also drops a **small die** on your hard target: it rolls 1–6 and deals face × 60% SP in 3 m, in the Wheel's current element (`tag_spell` `tag_area` + element). | `b_the_tithe_below` (`d02_drowned_mill` secret boss) on Challenge, 3%; end chest at **Depth 15+**, 1% |
| `soul_lucky_patron` | Soul of the Lucky Patron | jewellery (neck or ring) | class: sorcerer | While rolling the **Boon Table**, a party member who receives a boon while below 35% health also gets a barrier of 10% of their max health (once per member per 10 s) (`tag_shield`). | the world boss of `whisperwood` (page 13), 2%; end chest at **Depth 10+**, 1% |

---

## 10. Voice and barks

- Timbre: `shared/voices.js` `voiceFor({ role: 'caster', gender, seed })`, pitch +8%, intonation 1.3 (sing-song, delighted). `(reuse)`
- Barks through Lingo (`lingo/`), tag `class:sorcerer`; 15 s anti-repeat.

| Event | Lines |
|---|---|
| Cast (big spell) | "Let's see what we get." · "Round and round…" · "Pick a colour. Any colour." |
| Flux release | "Oh — here it comes!" · "Hold onto something." · "Chaos, do your worst!" |
| Boon release | "Luck's on the house." · "Everybody, catch!" |
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
| Boon riders | STATUS_FX `haste`, `barrier`, `enchant` recoloured per element | small sprites over the ally |
| Wheel Mote | pet `storm_familiar` look (`js/pets.js` CLASS_PETS) | cosmetic only |
| Outfit | `avatar-3d/data/class-outfits.json` `sorcerer` | hood, high-collar robe, rune halo |
| Talent engine | `prototypes/farhold/js/skilltalents.js` | Wildmarch tier levels 12/22/32/45 |
| Emberveil 2 prototype ideas | `wild_bolt`, `sorc_arcane_surge`, `mana_burn`, `chaos_ward` | reborn as Flux Bolt, Wild Crown, the Mana Burn talent, Fortune's Shell |
