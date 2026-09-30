# Runesmith — class 26

> *"A rune is a promise cut in stone. I keep mine all at once."*

**Role:** Tank · **Can also:** Damage · **Armour:** heavy · **Resource:** Fury + the **Rune Slate** gauge · **Primary attribute:** STR (CON second)
Owner of this file: every `runesmith_*` spell, talent, set, legendary and unique. Template: [page 00 §5](../00-OVERVIEW.md).
Threat, taunt and damage maths: [page 05](../05-COMBAT.md).

### Numbers used on this page

| Term | Meaning |
|---|---|
| **% weapon** | percent of your weapon's damage roll (page 05). The Runesmith scales off weapon damage, not spell power. |
| Fury | 0–100. +6 per basic hit, +3 when hit (max once per 0.5 s), +5 per block. Decays 4 per second after 5 s out of combat. |
| Threat | how much an enemy wants to hit you. "×3 threat" multiplies the threat your damage makes (page 05). |
| Taunt | forces an enemy to attack you for N seconds and sets your threat to the top of its list +10% |
| GCD | 1.0 s global cooldown; the Runesmith's cannot be hasted below 0.9 s |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A smith-priest of the Deepforge Clans who fights by **carving**: into the ground, into the enemy, into allies. Runes sit and wait; when the Runesmith speaks them, they all answer at once. |
| Role | Tank (main). Damage spec through talents (bigger Speak, fewer defensive riders). |
| Armour | heavy (plate, rune helm, greaves, rune bracers) |
| Weapons | one-hand hammer + shield (tank), or two-hand hammer / greataxe (damage). `(reuse: farhold/js/weapons.js patterns for hammer, warhammer, greataxe)` |
| Resource | Fury |
| Companion | none. The runes themselves are the "pieces" the Runesmith manages. |
| Playstyle | 1) Carve runes — on enemies with your hammer, on the ground with thrown stones, on yourself and allies. 2) Keep them alive while you hold threat. 3) Speak them all at once for a burst of damage, taunts, stuns and barriers. |

Starting kit: Journeyman's Hammer, round shield, heavy chest, heavy helm, 1 spell (`runesmith_etching_blow`).

---

## 2. Class mechanic — Runes (the Rune Slate)

### 2.1 How runes work

- Spells carve **runes** in one of three places: **on an enemy** (brand), **on the ground** (circle), **on yourself or an ally** (ward).
- Each rune fills one **socket** on the Rune Slate. Socket count: 2 at level 1, then 3 / 4 / 5 from the calling quests.
  Carving a rune when the Slate is full **replaces the oldest** (it pops at 50% as it goes).
- A rune lasts its own time (listed per spell). When it runs out it **fades-pops**: its Spoken effect at 50%.
- **Speak the Runes** (spell 2) makes every rune you own within 40 m go off at once at 100%. Sockets empty.
- Runes are visible to every player: teal (`#58d8f0`, the class-outfit accent) glowing glyphs; each type has its own glyph.
  Other Runesmiths' runes are drawn at 50% opacity so two Runesmiths can tell whose is whose.

| Rune | Carved by | Where | Lasts | When Spoken (100%) |
|---|---|---|---|---|
| Rune of Challenge | Etching Blow | enemy | 15 s | 180% weapon to that enemy + stun 1.5 s (bosses: take 8% more from you for 6 s) |
| Rune of Holding | Calling Stone | ground, 6 m | 12 s | pulls enemies inside 4 m toward the centre, 150% weapon, **taunts** all of them for 3 s |
| Rune of Endurance | Stoneblood Rune | self / ally | 8 s | ends early, heals the wearer for 25% of the damage it prevented |
| Rune of Warding | Ward Stone | ground, 7 m | 12 s | barrier 12% max HP on every ally inside for 8 s |
| Grand Inscription | Grand Inscription | ground, 14 m | 15 s | 400% weapon in 14 m, 5 rim lines, allies inside gain Runeforged |

### 2.2 The gauge (HUD)

- The **Rune Slate**: a grey stone tablet under the Fury bar with 2–5 sockets.
- A filled socket shows the rune's glyph, a small letter for where it is (**E** enemy, **G** ground, **A** ally, **S** self), and
  a draining teal outline for time left. Hovering a socket outlines that rune in the world. Empty sockets are dark.
- When 4+ sockets are full, the Speak the Runes slot on the spell bar pulses (Calling 40: Runeforged will trigger).
- Resonance lines (Calling 6) are drawn between ground runes on the ground and as thin lines between sockets on the Slate.

### 2.3 Calling quests

| Level | Quest id | Summary | Grants |
|---|---|---|---|
| 1 | — | — | 2 sockets, runes, fade-pop. |
| 6 | `q_runesmith_calling_anvil` | Hearthvale → Greyridge road: take a cracked rune-stone to the Anvilgate forge, re-cut it under a clan elder's eye (a timed hammer minigame: strike when the glow peaks, 5 strikes), then hold a mine gate for 90 s against tunnel raiders. | **3rd socket**, the **Rune Slate gauge**, and **Resonance**: any two of your ground runes within 12 m are joined by a line; when Spoken, enemies on the line take 100% weapon. |
| 20 | `q_runesmith_calling_ward` | Sunscar: carve wards on 5 Sandsworn guards (allies) and keep all of them alive through a sandstorm raid on the oasis. | **4th socket**, runes on **allies** (Stoneblood Rune can be cast on another player at 60% strength), and the **Weapon Rune**: Speaking any rune etches your weapon — next 3 hits +40% as rune damage (arcane). |
| 40 | `q_runesmith_calling_master` | Frostmantle: find the Rimehold master's lost five-sided rune; carve its five parts at five glacier shrines, then Speak them while fighting the shrine's frost giant. | **5th socket** and **Runeforged**: Speaking 4+ runes at once grants 10 s of *Runeforged* — 20% less damage taken, Fury costs −50%, Speak the Runes' cooldown resets once. |

---

## 3. The six spells

### 3.1 At a glance

| Slot | id | Name | Lvl | Cost | CD | Cast | Range | Shape | Main number |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `runesmith_etching_blow` | Etching Blow | 1 | builds 15 Fury | 4.5 s | instant | 3.4 m | 100° arc | 150% weapon, ×3 threat brand |
| 2 | `runesmith_speak_the_runes` | Speak the Runes | 4 | 30 Fury | 12 s | instant | 40 m | every rune you own | each rune's burst |
| 3 | `runesmith_calling_stone` | Calling Stone | 10 | free | 8 s | instant | 30 m | thrown → 6 m ground | taunt 3 s + Holding rune |
| 4 | `runesmith_stoneblood_rune` | Stoneblood Rune | 18 | 20 Fury | 90 s | instant, off GCD | self (ally at 20) | self / ally | −40% damage taken 8 s |
| 5 | `runesmith_ward_stone` | Ward Stone | 28 | 40 Fury | 45 s | instant | 20 m | ground, 7 m | −15% damage for allies 12 s |
| 6 | `runesmith_grand_inscription` | Grand Inscription | 40 | 60 Fury | 90 s | 2 s cast | self | ground, 14 m | 400% weapon on Speak |

### 3.2 Details

**`runesmith_etching_blow` — Etching Blow** (slot 1, level 1) `(new)`
- Builds 15 Fury · 4.5 s · instant · 3.4 m reach, 100° arc (or your weapon's swing if bigger — `(reuse: farhold skills melee reach rule)`).
- 150% weapon to everything in the arc. The **primary target** (the one you face) is carved with a **Rune of Challenge** for 15 s:
  your damage makes **×3 threat** on it. Re-carving refreshes it (same socket).
- Look: an overhead hammer chop (Chibi 2 `CHIBI2_MELEE_ANIMS` overhead), a teal glyph scorched onto the enemy's chest, spark shower (spellfx `physical` impact + `arcane` rune sprite). Sound: anvil ring + stone scrape.

**`runesmith_speak_the_runes` — Speak the Runes** (slot 2, level 4) `(new)`
- 30 Fury · 12 s · instant · affects every rune you own within 40 m (runes out of range stay).
- Each rune goes off with its "When Spoken" effect (table in §2.1). Sockets empty.
- If no runes exist: a 5 m shout, 80% weapon, and +20 Fury back (so the key is never dead).
- Look: the Runesmith slams the haft down and roars a word — each rune flares white-teal and bursts upward (spellfx `holy` rune shape recoloured teal, per-rune impact). Sound: a deep spoken syllable (formant voice, low pitch) + a chord of stone cracks.

**`runesmith_calling_stone` — Calling Stone** (slot 3, level 10) `(new)`
- Free · 8 s · instant · thrown 30 m.
- **Taunts** the target for 3 s (single-target taunt, the tank-swap tool). Where it lands it carves a **Rune of Holding**:
  6 m circle, 12 s — enemies inside are slowed 20% and take 5% weapon as threat-only damage per second from you.
- Speaking a Rune of Holding **taunts everything inside** (the AoE taunt).
- Look: a fist-sized glowing stone in an arc (spellfx `physical` arrow shape swapped for a stone mesh), a circle of glyphs on landing. Sound: a whistle, a heavy thud, stone hum.

**`runesmith_stoneblood_rune` — Stoneblood Rune** (slot 4, level 18) `(new)` — **the big defensive cooldown**
- 20 Fury · 90 s · instant, off the GCD · self (Calling 20: or an ally within 30 m at 60% strength).
- The wearer takes **40% less damage** for 8 s and cannot be knocked back or down. Skin turns grey stone with teal cracks.
- If damage taken during it reaches 30% of max health, the rune **cracks**: instant heal of 15% max health (once).
- Speaking it ends it early and heals 25% of the damage it prevented.
- Look: STATUS_FX `sunder` cracks recoloured teal, grey tint (Chibi 2 material tint). Sound: grinding stone, a heartbeat slowing.

**`runesmith_ward_stone` — Ward Stone** (slot 5, level 28) `(new)`
- 40 Fury · 45 s · instant · ground, up to 20 m (default: at your feet) · 7 m circle, 12 s.
- Allies inside take **15% less damage** and resist knockbacks by 50% (distance halved).
- Speaking it gives each ally inside a barrier of 12% of their max health for 8 s.
- Look: a waist-high carved standing stone rises; glyph ring on the ground (spellfx `holy` ground rune disc, teal). Sound: stone rising, low hum loop.

**`runesmith_grand_inscription` — Grand Inscription** (slot 6, level 40) `(new)`
- 60 Fury · 90 s · **2 s cast** (you carve; interrupted by stuns only) · self · ground 14 m circle for 15 s, **uses 1 socket**.
- Inside: enemies deal 15% less damage, allies deal 10% more, your threat inside is doubled.
- Five small rim runes sit on the circle's edge. **Speak:** 400% weapon to every enemy inside, each rim rune fires a 1.5 m wide line to the centre for 120% weapon, non-boss enemies are knocked down 1.5 s, allies inside gain **Runeforged** for 10 s (even without Calling 40).
- Look: the Runesmith hammers the ground five times; a huge teal circle burns outward with five pillars at the rim. On Speak the pillars fire beams to the centre (spellfx beam, `arcane` palette tinted teal). Sound: five anvil strikes, a rising choir drone, a cracking boom.

---

## 4. Alternate spells

| Trigger | Replaces | Becomes | Numbers |
|---|---|---|---|
| **Runeforged** active (Calling 40, or Grand Inscription) | Etching Blow | **Rune-Driven Blow** `runesmith_rune_driven_blow` | 220% weapon, carves Challenge on **every** enemy in the arc (uses 1 socket in total) |
| Weapon Rune active (Calling 20, 3 hits after a Speak) | basic attack | etched hits | +40% as arcane rune damage, teal trail on the weapon |

---

## 5. Talents (tiers at 12 / 22 / 32 / 45)

### Etching Blow
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `runesmith_etching_blow_t1a` | Wide Etch | Brands the 2 nearest enemies in the arc, not just the primary (each uses a socket). |
| 12 | `runesmith_etching_blow_t1b` | Deep Etch | Brand lasts 30 s and its Spoken damage is 260%. |
| 22 | `runesmith_etching_blow_t2a` | Shield Etch | With a shield equipped, becomes a shield slam: 4 m, knocks the target back 3 m and interrupts non-boss casts. |
| 22 | `runesmith_etching_blow_t2b` | Hungry Rune | A branded enemy that attacks you gives you +4 Fury. |
| 32 | `runesmith_etching_blow_t3a` | Rune of Doubt | Branded enemies deal 10% less damage to everyone but you. |
| 32 | `runesmith_etching_blow_t3b` | Sparking Etch | Hitting an already-branded enemy discharges it (spoken at 60%) and re-carves it. |
| 45 | `runesmith_etching_blow_t4a` | Mark of the Clan | Brands jump to a new enemy within 10 m when the branded one dies (keeps remaining time). |
| 45 | `runesmith_etching_blow_t4b` | Twin Strike | Two chops in 0.8 s, 100% each; the second brands. |

### Speak the Runes
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `runesmith_speak_the_runes_t1a` | Measured Word | Speaks only the rune under your crosshair (the rest stay); cooldown 4 s. |
| 12 | `runesmith_speak_the_runes_t1b` | Loud Word | Range 60 m and every rune's radius +2 m when Spoken. |
| 22 | `runesmith_speak_the_runes_t2a` | Echoing Word | Spoken runes are re-carved at 50% for 6 s, then fade-pop again. |
| 22 | `runesmith_speak_the_runes_t2b` | Tithe of Fury | Refund 8 Fury per rune Spoken. |
| 32 | `runesmith_speak_the_runes_t3a` | Word of Iron | Each rune Spoken gives you 4% less damage taken for 8 s (stacks to 5). |
| 32 | `runesmith_speak_the_runes_t3b` | Word of Ruin | Each rune's damage +35%, but ground runes no longer taunt (damage spec). |
| 45 | `runesmith_speak_the_runes_t4a` | Chain of Words | Runes go off one after another, 0.2 s apart, each +10% more than the last. |
| 45 | `runesmith_speak_the_runes_t4b` | The Unspoken | Holding the key 1 s Speaks **without emptying sockets**; 30 s cooldown for that use. |

### Calling Stone
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `runesmith_calling_stone_t1a` | Skipping Stone | Bounces to 2 more enemies within 8 m, taunting each (1.5 s). |
| 12 | `runesmith_calling_stone_t1b` | Lodestone | Pulls the struck target 6 m toward you (not bosses). |
| 22 | `runesmith_calling_stone_t2a` | Holding Fast | The Holding circle roots non-boss enemies for 2 s when carved. |
| 22 | `runesmith_calling_stone_t2b` | Stone Wall | Carves a 10 m × 1 m line instead of a circle, blocking enemy movement (not bosses) for 6 s. |
| 22 | `runesmith_calling_stone_t2c` | Rescue Stone | Thrown at an **ally**: taunts every enemy attacking them for 3 s. |
| 32 | `runesmith_calling_stone_t3a` | Second Stone | 2 charges. |
| 32 | `runesmith_calling_stone_t3b` | Heavy Stone | Stuns the target 1 s (bosses: interrupts one gold-bordered cast, once per 30 s). |
| 45 | `runesmith_calling_stone_t4a` | Portable Holding | The Holding rune follows you at your feet, so moving a boss out of a void zone keeps it. |
| 45 | `runesmith_calling_stone_t4b` | Boulder | A 3 m boulder rolls 20 m along the throw line, 150% weapon and knockback to everything it rolls over. |

### Stoneblood Rune
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `runesmith_stoneblood_rune_t1a` | Deeper Stone | 50% reduction, but you move 20% slower during it. |
| 12 | `runesmith_stoneblood_rune_t1b` | Quick Stone | 60 s cooldown, 5 s duration. |
| 22 | `runesmith_stoneblood_rune_t2a` | Thorned Stone | Melee attackers take 30% weapon each time they hit the wearer. |
| 22 | `runesmith_stoneblood_rune_t2b` | Shared Stone | While on you, allies within 8 m take 10% less damage. |
| 32 | `runesmith_stoneblood_rune_t3a` | Last Carving | If you would die while it is ready, it triggers by itself at 1 HP (once per 3 min). |
| 32 | `runesmith_stoneblood_rune_t3b` | Crackback | When the rune cracks, it also deals 200% weapon in 6 m. |
| 45 | `runesmith_stoneblood_rune_t4a` | Mountain's Heart | Becomes a 12 s channel-free stance: reduction starts at 60% and falls 5% per second. |
| 45 | `runesmith_stoneblood_rune_t4b` | Two Stones | 2 charges; casting on an ally is now 100% strength. |

### Ward Stone
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `runesmith_ward_stone_t1a` | Walking Ward | The stone floats beside you and the circle follows you (6 m). |
| 12 | `runesmith_ward_stone_t1b` | Twin Wards | Two 5 m stones at two spots. |
| 22 | `runesmith_ward_stone_t2a` | Stone of Clarity | Allies inside are immune to fear, charm and sleep (does not free anyone already affected). |
| 22 | `runesmith_ward_stone_t2b` | Stone of Grounding | Allies inside cannot be pulled or knocked back at all. |
| 32 | `runesmith_ward_stone_t3a` | Absorbing Stone | Soaks (orange circles) inside the ward count **one extra player**. |
| 32 | `runesmith_ward_stone_t3b` | Fortress Stone | The ward also blocks enemy projectiles crossing its edge (not boss beams). |
| 45 | `runesmith_ward_stone_t4a` | Standing Circle | 18 s, and the barrier on Speak is 20%. |
| 45 | `runesmith_ward_stone_t4b` | Stone Answers | Each ally hit inside the ward adds 1% to its Spoken barrier (cap +15%). |

### Grand Inscription
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `runesmith_grand_inscription_t1a` | Swift Carving | Cast time 0.8 s. |
| 12 | `runesmith_grand_inscription_t1b` | Thrown Inscription | Ground target up to 25 m instead of around you. |
| 22 | `runesmith_grand_inscription_t2a` | Circle of Law | Enemies inside cannot leave the circle (non-boss) until it is Spoken. |
| 22 | `runesmith_grand_inscription_t2b` | Circle of Rest | Allies inside regain 1.5% max health per second. |
| 32 | `runesmith_grand_inscription_t3a` | Seven Runes | 7 rim runes, each line 150%. |
| 32 | `runesmith_grand_inscription_t3b` | Inscribed Ground | Your other ground runes carved inside it last double. |
| 45 | `runesmith_grand_inscription_t4a` | World-Rune | Radius 20 m; the Speak also re-carves a Rune of Holding in the centre. |
| 45 | `runesmith_grand_inscription_t4b` | Final Word | When it fade-pops, it goes off at 100% instead of 50%. |

---

## 6. Rotation / how it plays

- **Solo:** Calling Stone to pull, Etching Blow the biggest thing, fight on top of the Holding rune, Speak when 2–3 runes are up. Stoneblood on champions.
- **Dungeon tank:** Calling Stone the first pack → Speak the Holding for an AoE taunt → Etch the casters → Ward Stone under the group for big pulls. Keep the Slate 2/3 full, Speak on cooldown. Stoneblood on "tank buster" casts (the big single-target hits page 11 marks).
- **Raid tank:** Brand the boss (×3 threat) and keep it; Calling Stone is the **tank swap**. The off-tank Runesmith pre-carves a Holding where adds spawn. Grand Inscription for the heaviest phase — it is both a raid-wide damage buff and the biggest barrier the class has.
- **Damage spec** (two-hand hammer, Word of Ruin, Deep Etch): Etch → Stone → Etch → Speak loop, Grand Inscription on cooldown.

## 7. Boss mechanics

| Mechanic | Runesmith answer |
|---|---|
| Tank buster | Stoneblood Rune (−40%, crack heal). Ally version lets the Runesmith cover the *other* tank. |
| Tank swap | Calling Stone's single taunt (8 s CD). |
| Adds | Holding rune where they spawn; Speak for AoE taunt. |
| Moving the boss out of void zones | Ground runes stay behind — Portable Holding (Stone t4a) or Walking Ward fix it. |
| Knockbacks off ledges | Stoneblood (immune), Ward Stone (−50% distance, Grounding talent: immune). |
| Soaks | Ward Stone under the soak; Absorbing Stone talent counts one extra person. |
| Fear / charm on the group | Stone of Clarity talent. |
| Interrupts | Shield Etch (non-boss), Heavy Stone (one boss interrupt per 30 s). A secondary interrupter only. |

---

## 8. Class sets

### `set_runesmith_forgewardens_plate` — Forgewarden's Plate (levels 14–18)
Drops: `d03_deepdelve` and `d04_bellows_keep` bosses (Normal), 15% per boss; complete on Heroic.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Etching Blow builds 20 Fury instead of 15. | `runesmith_etching_blow` |
| 4 | Speak the Runes with 3+ runes also gives you a barrier of 10% max HP. | `runesmith_speak_the_runes` |
| 6 | Calling Stone's Holding rune lasts 20 s and has 8 m radius. | `runesmith_calling_stone` |

### `set_runesmith_glacier_runes` — Runes of the Glacier Throne (level 42)
Drops: `r02_glacier_throne` bosses 1–6 (Normal), token system per page 09.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Ground runes you carve slow enemies inside by an extra 10%. | all ground runes |
| 4 | Stoneblood Rune also carves a Rune of Warding (4 m) at your feet. | `runesmith_stoneblood_rune` |
| 6 | When Ward Stone is Spoken, it freezes non-boss enemies inside for 2 s. | `runesmith_ward_stone` |

### `set_runesmith_emberforged_aegis` — The Emberforged Aegis (level 60)
Drops: `r04_ember_court` (Normal + Mythic); 6th piece Mythic only.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | +1 socket on the Rune Slate (max 6). | Rune Slate |
| 4 | Grand Inscription cooldown −30 s; its rim runes also taunt their line's targets. | `runesmith_grand_inscription` |
| 6 | Every Runeforged grants the whole party 8% less damage taken for its duration. | Runeforged |

---

## 9. Legendaries and uniques

| id | Name | Slot | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_first_hammer_of_anvilgate` | First Hammer of Anvilgate | one-hand hammer | Etching Blow brands **every** enemy in the arc using only one socket; the brands share their timer. | `d04_bellows_keep` Heroic/Mythic+ final boss (4%) |
| `leg_slate_of_unwritten_names` | Slate of Unwritten Names | off hand (shield) | Sockets 7. Runes carved past 5 cost no Fury on Speak. Blocks give +2 s to all runes. | `r05_veilspire` boss 7 (Mythic 6%) |
| `leg_ironroot_greaves` | Ironroot Greaves | legs | While standing in your own ground rune, you take 12% less damage and your Fury does not decay. | Frostmantle world boss (weekly 6%) |
| `leg_mountains_patience` | The Mountain's Patience | chest | Stoneblood Rune gains 1 s per rune Spoken while it is active (cap +8 s). | `r02_glacier_throne` final boss (Normal 3%, Heroic re-clears 5%) |
| `leg_the_last_word` | The Last Word | two-hand hammer | Speak the Runes with 5+ runes deals an extra 25% weapon per rune to the highest-health enemy. | `d14_ashen_reliquary` Mythic+ final boss (key 10+, 5%) |
| `uq_chisel_of_the_deep` | Chisel of the Deep | one-hand hammer | +10% Fury gained. Brands last 20 s. | `d03_deepdelve` final boss (Normal) |
| `uq_runecarvers_bracers` | Runecarver's Bracers | hands | Fade-pops happen at 75% instead of 50%. | `d06_sandsworn_vault` boss 2 |
| `uq_stone_of_the_clan_hall` | Stone of the Clan Hall | off hand (shield) | Calling Stone taunt lasts 5 s; block chance +5%. | Greyridge world boss |
| `uq_wardwell_girdle` | Wardwell Girdle | belt / waist | Ward Stone's barrier is also applied to you when you are outside it. | `d11_saltdeep_cathedral` boss 1 |

---

## 10. Voice and barks

- Timbre: `voiceFor({ role: 'tank', gender, seed })`, pitch −15%, depth +20%, slow, gravel (rough 0.3). Speak the Runes plays one of 12 invented "rune words" through the formant engine at −30% pitch. `(reuse: shared/voices.js)`

| Event | Lines |
|---|---|
| Carve | "Marked." · "That one's mine." · "Stay put." |
| Speak | (rune words) "Kharn-deth!" · "Ulvan-ro!" · "Thur-kol!" |
| Taunt | "Over here, stone-breaker!" · "Your fight is with me." |
| Stoneblood | "I am the mountain." · "Try again." |
| Crit | "Clean cut." |
| Low health | "The stone is cracking — heal me!" · "I need mending!" |
| Out of Fury | "No fire in the forge." |
| Wipe/death | "Carve my name… somewhere…" |

---

## 11. Reuse notes

| Wildmarch piece | Borrowed from | Notes |
|---|---|---|
| Etching Blow swing | Farhold `power_strike` / `sunder` melee arc logic, Chibi 2 overhead clip | visuals + arc rule |
| Stoneblood | Farhold `stoneskin` status look | stronger, new numbers |
| Ward Stone | Farhold `guard_stance` holy ground disc | teal tint |
| Grand Inscription beams | spellfx beam (`storm_beam`) | teal palette |
| Outfit | `avatar-3d/data/class-outfits.json` `runesmith` (rune helm, plate, rune bracers) | |
| Emberveil ideas | `rune_hammer`, `rune_of_warding`, `rune_of_might`, `forge_flame` | reborn as Etching Blow, Ward Stone, Grand Inscription, Weapon Rune |
