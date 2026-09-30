# Runesmith — class design (`runesmith`)

> *"A rune is a promise cut in stone. I keep mine all at once."*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Follows the class template in [page 00 §5](../00-OVERVIEW.md).
Canon facts used (page 00 §6): primary role **Tank**, hybrid role **Damage**, build **melee**, **heavy** armour,
resource **Mana** (one of the two Mana melee classes, with the paladin), mechanic **Runes — inscribes runes on
ground / weapon / allies, detonates**, spell slots **1 / 4 / 10 / 18 / 28 / 40**, calling quests **6 / 20 / 40**,
talent tiers **12 / 22 / 32 / 45**, cap **60**.
Owner of this file: every `runesmith_*` spell, talent, set, legendary, unique and soul.
Threat, taunt and damage maths: [page 05](../05-COMBAT.md).

## How to read the numbers on this page

| Term | Meaning |
|---|---|
| **% WD** | percent of one weapon hit (page 05). The runesmith scales off **weapon damage**, not spell power — the runes are cut with the hammer. The number is final |
| **Mana** | the runesmith's resource. Pool = **100% base Mana** (≈1,600 at level 60 — a melee Mana pool is two-thirds of a caster's, page 07). **Regenerates 1% of max per second in combat, 3% out of combat.** Costs are written as % of base maximum Mana. **Builders:** Etching Blow **+3%**, each basic hit that connects **+0.5%**, each block **+1%** (once per 0.5 s). **Spenders:** Calling Stone 3%, Stoneblood Rune 5%, Speak the Runes 8%, Ward Stone 10%, Grand Inscription 15% |
| **Threat** | how much an enemy wants to hit you. "×3 threat" multiplies the threat your damage makes (page 05) |
| **Taunt** | forces an enemy to attack you for N seconds and sets your threat to the top of its list +10% |
| GCD | 1.0 s; the runesmith's cannot be hasted below 0.9 s |
| **Targeting** | page 02 / 00 §12.1 W8. **Needs target** = will not cast without a valid hard target. **Auto-target** = with no valid target it picks the valid enemy closest to your aim point in range. **Ground**. **Self**. **Ally** = a party member or yourself (`F1`–`F5`) |
| **Tags** | page 05 §Tags owns the list. A **Spoken** rune's burst carries `tag_arcane` `tag_spell` plus its own shape tags, so the runesmith is the one melee class that gains from Spell bonuses on its bursts and Attack bonuses on its swings |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A smith-priest of the Deepforge Clans who fights by **carving**: into the ground, into the enemy, into allies. Runes sit and wait; when the runesmith speaks them, they all answer at once. |
| Primary role | **Tank** |
| Hybrid role | **Damage** — the **Breaker** build: two-hand hammer, bigger Speaks, fewer defensive riders (§5) |
| Build | melee |
| Armour | heavy (plate, rune helm, greaves, rune bracers) |
| Weapons | one-hand hammer + shield (tank), or two-hand hammer / greataxe (damage) `(reuse: farhold/js/weapons.js patterns for hammer, warhammer, greataxe)` |
| Primary attribute | STR (CON second) |
| Resource | **Mana** + the **Rune Slate** gauge |
| Companion | none. The runes themselves are the pieces the runesmith manages. |
| Starting kit | Journeyman's Hammer, round shield, heavy chest, heavy helm, 1 spell (`runesmith_etching_blow`) |

**Playstyle in three sentences.** Carve runes — on enemies with your hammer, on the ground with thrown stones,
on yourself and allies. Keep them alive while you hold threat; every carve that lands with the hammer refills
Mana. Speak them all at once for a burst of damage, taunts, stuns and barriers.

---

## 2. Class mechanic — Runes (the Rune Slate)

### 2.1 How runes work

- Spells carve **runes** in one of three places: **on an enemy** (brand), **on the ground** (circle), **on yourself or an ally** (ward).
- Each rune fills one **socket** on the Rune Slate. Socket count: 2 at level 1, then 3 / 4 / 5 from the calling quests.
  Carving a rune when the Slate is full **replaces the oldest** (it pops at 50% as it goes).
- A rune lasts its own time (listed per spell). When it runs out it **fade-pops**: its Spoken effect at 50%.
- **Speak the Runes** (spell 2) makes every rune you own within 40 m go off at once at 100%. Sockets empty.
- Runes are visible to every player: teal (`#58d8f0`, the class-outfit accent) glowing glyphs; each type has its own glyph.
  Another runesmith's runes are drawn at 50% opacity so two runesmiths can tell whose is whose.

| Rune | Carved by | Where | Lasts | When Spoken (100%) | Tags of the burst |
|---|---|---|---|---|---|
| Rune of Defiance | Etching Blow | enemy | 15 s | 180% WD to that enemy + stun 1.5 s (bosses: take 8% more from you for 6 s) | `tag_arcane` `tag_spell` |
| Rune of Holding | Calling Stone | ground, 6 m | 12 s | pulls enemies inside 4 m toward the centre, 150% WD, **taunts** all of them for 3 s | `tag_arcane` `tag_spell` `tag_area` |
| Rune of Endurance | Stoneblood Rune | self / ally | 8 s | ends early, heals the wearer for 25% of the damage it prevented | `tag_heal` |
| Rune of Warding | Ward Stone | ground, 7 m | 12 s | barrier 12% max health on every ally inside for 8 s | `tag_shield` `tag_area` |
| Grand Inscription | Grand Inscription | ground, 14 m | 15 s | 400% WD in 14 m, 5 rim lines, allies inside gain Runeforged | `tag_arcane` `tag_spell` `tag_area` |

### 2.2 The gauge (HUD)

- The **Rune Slate**: a grey stone tablet under the Mana bar with 2–5 sockets.
- A filled socket shows the rune's glyph, a small letter for where it is (**E** enemy, **G** ground, **A** ally, **S** self), and
  a draining teal outline for time left. Hovering a socket outlines that rune in the world. Empty sockets are dark.
- When 4+ sockets are full, the Speak the Runes slot on the spell bar pulses (Calling 40: Runeforged will trigger).
- Resonance lines (Calling 6) are drawn between ground runes in the world and as thin lines between sockets on the Slate.
- The runesmith has no class key (page 02 §5.16): Speak the Runes is spell 2.

### 2.3 Calling quests (page 14 owns the quest text)

| Level | Quest id | Summary | Grants |
|---|---|---|---|
| 1 | — | — | 2 sockets, runes, fade-pop. |
| 6 | `q_calling_runesmith_1` | Hearthvale → Greyridge road: take a cracked rune-stone to the Anvilgate forge, re-cut it under a clan elder's eye (a timed hammer minigame: strike when the glow peaks, 5 strikes), then hold a mine gate for 90 s against tunnel-diggers. | **3rd socket**, the **Rune Slate gauge**, and **Resonance**: any two of your ground runes within 12 m are joined by a line; when Spoken, enemies on the line take 100% WD (`tag_arcane` `tag_spell`). |
| 20 | `q_calling_runesmith_2` | Sunscar: carve wards on 5 Sandsworn guards (allies) and keep all of them alive through a sandstorm attack on the oasis. | **4th socket**, runes on **allies** (Stoneblood Rune can be cast on another player at 60% strength), and the **Weapon Rune**: Speaking any rune etches your weapon — the next 3 hits deal +40% as rune damage (`tag_arcane`). |
| 40 | `q_calling_runesmith_3` | Frostmantle: find the Rimehold master's lost five-sided rune; carve its five parts at five glacier shrines, then Speak them while fighting the shrine's frost giant. | **5th socket** and **Runeforged**: Speaking 4+ runes at once grants 10 s of *Runeforged* — 20% less damage taken, Mana costs −50%, Speak the Runes' cooldown resets once. |

(Quest ids renamed to canon form: `q_runesmith_calling_anvil` / `_ward` / `_master` → `q_calling_runesmith_1` / `_2` / `_3`.)

---

## 3. The six spells

### 3.1 At a glance

| Slot | Lvl | id | Name | Cost | CD | Cast | Targeting | Range / shape | Tags | Main number |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `runesmith_etching_blow` | Etching Blow | **restores 3% Mana** | 4.5 s | instant | Auto-target | 3.4 m, 100° arc | `tag_physical` `tag_attack` `tag_melee` `tag_area` `tag_duration` | 150% WD, ×3 threat brand |
| 2 | 4 | `runesmith_speak_the_runes` | Speak the Runes | 8% Mana | 12 s | instant | Self | every rune you own in 40 m | `tag_arcane` `tag_spell` `tag_area` | each rune's burst |
| 3 | 10 | `runesmith_calling_stone` | Calling Stone | 3% Mana | 8 s | instant | Needs target | thrown 30 m → 6 m ground rune | `tag_physical` `tag_ranged` `tag_projectile` `tag_area` `tag_duration` | taunt 3 s + Holding rune |
| 4 | 18 | `runesmith_stoneblood_rune` | Stoneblood Rune | 5% Mana | 90 s | instant, off GCD | Self (Ally from Calling 20) | self / ally 30 m | `tag_shield` `tag_duration` | −40% damage taken 8 s |
| 5 | 28 | `runesmith_ward_stone` | Ward Stone | 10% Mana | 45 s | instant | Ground | 20 m, 7 m circle | `tag_area` `tag_aura` `tag_duration` | −15% damage for allies 12 s |
| 6 | 40 | `runesmith_grand_inscription` | Grand Inscription | 15% Mana | 90 s | 2 s cast | Self | ground, 14 m around you | `tag_arcane` `tag_spell` `tag_area` `tag_duration` | 400% WD on Speak |

### 3.2 Details

**`runesmith_etching_blow` — Etching Blow** (slot 1, level 1) `(new)` — the builder
- **Restores 3% Mana** · 4.5 s · instant · 3.4 m reach, 100° arc (or your weapon's swing if bigger — `(reuse: farhold skills melee reach rule)`).
- Targeting: **Auto-target** — the brand goes on your hard target if it is in the arc, otherwise on the enemy nearest your aim point inside the arc.
- Tags: `tag_physical` `tag_attack` `tag_melee` `tag_area` (the brand: `tag_duration`).
- 150% WD to everything in the arc. The **primary target** is carved with a **Rune of Defiance** for 15 s:
  your damage makes **×3 threat** on it. Re-carving refreshes it (same socket).
- Look: an overhead hammer chop (Chibi 2 `CHIBI2_MELEE_ANIMS` overhead), a teal glyph scorched onto the enemy's chest, spark shower (spellfx `physical` impact + `arcane` rune sprite). Sound: anvil ring + stone scrape.

**`runesmith_speak_the_runes` — Speak the Runes** (slot 2, level 4) `(new)`
- 8% Mana · 12 s · instant · **Self** · affects every rune you own within 40 m (runes out of range stay).
- Tags: `tag_arcane` `tag_spell` `tag_area` (each rune adds its own, §2.1).
- Each rune goes off with its "When Spoken" effect (§2.1). Sockets empty.
- If no runes exist: a 5 m shout, 80% WD, and 4% Mana back (so the key is never dead).
- Look: the runesmith slams the haft down and roars a word — each rune flares white-teal and bursts upward (spellfx `holy` rune shape recoloured teal, per-rune impact). Sound: a deep spoken syllable (formant voice, low pitch) + a chord of stone cracks.

**`runesmith_calling_stone` — Calling Stone** (slot 3, level 10) `(new)`
- 3% Mana · 8 s · instant · thrown up to 30 m.
- Targeting: **Needs target** — a taunt always goes where you chose (it is the tank-swap tool).
- Tags: `tag_physical` `tag_ranged` `tag_projectile` (the Holding circle: `tag_area` `tag_duration`).
- **Taunts** the target for 3 s. Where it lands it carves a **Rune of Holding**: 6 m circle, 12 s — enemies
  inside are slowed 20% and take 5% WD as threat-only damage per second from you.
- Speaking a Rune of Holding **taunts everything inside** (the area taunt).
- Look: a fist-sized glowing stone in an arc (spellfx `physical` arrow shape swapped for a stone mesh), a circle of glyphs on landing. Sound: a whistle, a heavy thud, stone hum.

**`runesmith_stoneblood_rune` — Stoneblood Rune** (slot 4, level 18) `(new)` — **the big defensive cooldown**
- 5% Mana · 90 s · instant, off the GCD.
- Targeting: **Self**; from Calling 20 also **Ally** (30 m, at 60% strength).
- Tags: `tag_shield` `tag_duration` (the crack heal: `tag_heal`).
- The wearer takes **40% less damage** for 8 s and cannot be knocked back or down. Skin turns grey stone with teal cracks.
- If damage taken during it reaches 30% of max health, the rune **cracks**: instant heal of 15% max health (once).
- Speaking it ends it early and heals 25% of the damage it prevented.
- Look: STATUS_FX `sunder` cracks recoloured teal, grey tint (Chibi 2 material tint). Sound: grinding stone, a heartbeat slowing.

**`runesmith_ward_stone` — Ward Stone** (slot 5, level 28) `(new)`
- 10% Mana · 45 s · instant · **Ground**, up to 20 m (with no aim point: at your feet) · 7 m circle, 12 s.
- Tags: `tag_area` `tag_aura` `tag_duration` (the Spoken barrier: `tag_shield`).
- Allies inside take **15% less damage** and resist knockbacks by 50% (distance halved).
- Speaking it gives each ally inside a barrier of 12% of their max health for 8 s.
- Look: a waist-high carved standing stone rises; glyph ring on the ground (spellfx `holy` ground rune disc, teal). Sound: stone rising, low hum loop.

**`runesmith_grand_inscription` — Grand Inscription** (slot 6, level 40) `(new)`
- 15% Mana · 90 s · **2 s cast** (you carve; broken only by stuns) · **Self** · ground 14 m circle around you for 15 s, **uses 1 socket**.
- Tags: `tag_arcane` `tag_spell` `tag_area` `tag_duration`.
- Inside: enemies deal 15% less damage, allies deal 10% more, your threat inside is doubled.
- Five small rim runes sit on the circle's edge. **Speak:** 400% WD to every enemy inside, each rim rune fires a 1.5 m wide line to the centre for 120% WD, non-boss enemies are knocked down 1.5 s, allies inside gain **Runeforged** for 10 s (even without Calling 40).
- Look: the runesmith hammers the ground five times; a huge teal circle burns outward with five pillars at the rim. On Speak the pillars fire beams to the centre (spellfx beam, `arcane` palette tinted teal). Sound: five anvil strikes, a rising choir drone, a cracking boom.

### 3.3 Rotation / how it plays

- **Solo:** Calling Stone to pull, Etching Blow the biggest thing, fight on top of the Holding rune, Speak when 2–3 runes are up. Stoneblood on champions and rares.
- **Dungeon tank:** Calling Stone the first pack → Speak the Holding for an area taunt → Etch the casters → Ward Stone under the group for big pulls. Keep the Slate 2/3 full, Speak on cooldown. Stoneblood on "tank buster" casts (the big single-target hits page 11 marks). Grand Inscription for the heaviest phase — it is both a group damage buff and the biggest barrier the class has.
- **Two-tank boss (Challenge mode):** brand the boss (×3 threat); Calling Stone is the **tank swap**. The off-tank pre-carves a Holding where adds spawn.
- **Mana:** a tank runesmith spends ≈1.5% of max Mana per second when every spell is on cooldown, against ≈1% regeneration + 0.67%/s from Etching Blow + basic hits and blocks. It runs slightly positive while it keeps hitting; a runesmith who stops swinging (kiting, a long move phase) runs dry in about **90 s**.

### 3.4 Boss mechanics

| Mechanic | Runesmith answer |
|---|---|
| Tank buster | Stoneblood Rune (−40%, crack heal). The ally version lets the runesmith cover the *other* tank or a targeted healer. |
| Tank swap | Calling Stone's single taunt (8 s cooldown); the shared **Provoke** (page 07, level 10) as a second one. |
| Adds | Holding rune where they spawn; Speak for the area taunt. |
| Moving the boss out of void zones | Ground runes stay behind — Portable Holding (Stone t4a) or Walking Ward fix it. |
| Knockbacks off ledges | Stoneblood (immune), Ward Stone (−50% distance; Grounding talent: immune). |
| Soaks | Ward Stone under the soak; the Absorbing Stone talent counts one extra person. |
| Fear / charm on the group | Stone of Clarity talent. |
| Interrupts | Shield Etch (non-boss), Heavy Stone (one boss interrupt per 30 s). A secondary interrupter only. |

---

## 4. Alternate spells

| Trigger | Replaces | Becomes | Numbers |
|---|---|---|---|
| **Runeforged** active (Calling 40, or Grand Inscription) | Etching Blow | **Rune-Driven Blow** `runesmith_rune_driven_blow` | Auto-target, 220% WD, carves Defiance on **every** enemy in the arc (uses 1 socket in total), restores 3% Mana. Tags as Etching Blow |
| Weapon Rune active (Calling 20, 3 hits after a Speak) | basic attack | etched hits | +40% as arcane rune damage (`tag_arcane`), teal trail on the weapon |

---

## 5. The hybrid role — Damage (the Breaker)

The runesmith uses the canon **Role focus** switch (00 §6; spellbook, out of combat, saved per Loadout), tied to
the off hand: **Hybrid (Damage)** needs a **two-hand hammer or greataxe** equipped, **Primary (Tank)** a shield,
and swapping the weapon out of combat flips the switch to match. What it changes: on Hybrid the brand's ×3 threat is
off (your damage makes normal threat), Etching Blow restores 4% Mana instead of 3% (below), and the Dungeon Finder
queues you as Damage. The spells stay the same; the Breaker talents below do the rest.

| Piece | How it deals damage |
|---|---|
| Two-hand weapon | basic hits and Etching Blow roll the bigger two-hand damage (page 05 weapon table); Etching Blow restores **4%** Mana with a two-hander (a Breaker spends more) |
| Speak the Runes t3b **Word of Ruin** | every rune's burst +35%, but ground runes no longer taunt — the key Breaker talent |
| Etching Blow t1b **Deep Etch** | brands last 30 s and Speak for 260% WD |
| Speak the Runes t2b **Tithe of Stone** | refunds 1.5% Mana per rune Spoken — pays for a Speak every cooldown |
| Calling Stone t4b **Boulder** | turns the taunt stone into a 150% WD rolling line |
| Grand Inscription t2a **Circle of Law** / t3a **Seven Runes** | keeps packs in the circle, bigger rim lines |
| Stoneblood Rune | stays: the Breaker still has the class's one big defensive |

**Loop:** Etch → Stone → Etch → Speak (every 12 s), Grand Inscription on cooldown, lined up with Runeforged.
A Breaker's Speak with 4 runes (Defiance brand at 260%, Holding 150%×1.35, Resonance line, Weapon Rune) is the
class's burst — about **1,250% WD in one second** against a pack.

**How good it is.** Against the dedicated melee damage classes, a Breaker runesmith lands about **85% of their
steady single-target damage** (its rhythm is tied to a 12 s Speak) but **more burst on packs** and a tank's
defensive cooldown. That is strong in the **open world, Normal dungeons and Depth up to about 10**. In
**Challenge mode** the 12 s rhythm is the weakness on long single-target bosses: a Breaker falls to about 80%
of a primary damage class there.

---

## 6. Utility spells

None. The runesmith has no travel or ritual spells; it uses scrolls and the Recall Stone ([page 20](../20-TRAVEL.md)).

---

## 7. Talents

One pick per tier. Tiers open at **12 / 22 / 32 / 45** (the later of the tier's level and the spell's slot level).
Ids `<spellid>_t<tier><a|b|c>`. `(reuse: prototypes/farhold/js/skilltalents.js)`

### Etching Blow
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `runesmith_etching_blow_t1a` | Wide Etch | Brands the 2 nearest enemies in the arc, not just the primary (each uses a socket). |
| 12 | `runesmith_etching_blow_t1b` | Deep Etch | Brand lasts 30 s and its Spoken damage is 260%. |
| 22 | `runesmith_etching_blow_t2a` | Shield Etch | With a shield equipped, becomes a shield slam: 4 m, knocks the target back 3 m and interrupts non-boss casts. |
| 22 | `runesmith_etching_blow_t2b` | Hungry Rune | A branded enemy that attacks you gives you 0.5% Mana (once per second). |
| 32 | `runesmith_etching_blow_t3a` | Rune of Doubt | Branded enemies deal 10% less damage to everyone but you. |
| 32 | `runesmith_etching_blow_t3b` | Sparking Etch | Hitting an already-branded enemy discharges it (Spoken at 60%) and re-carves it. |
| 45 | `runesmith_etching_blow_t4a` | Mark of the Clan | Brands jump to a new enemy within 10 m when the branded one dies (keeps remaining time). |
| 45 | `runesmith_etching_blow_t4b` | Twin Strike | Two chops in 0.8 s, 100% each; the second brands. |

### Speak the Runes
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `runesmith_speak_the_runes_t1a` | Measured Word | Speaks only the rune nearest your aim point (the rest stay); cooldown 4 s, 3% Mana. |
| 12 | `runesmith_speak_the_runes_t1b` | Loud Word | Range 60 m and every rune's radius +2 m when Spoken. |
| 22 | `runesmith_speak_the_runes_t2a` | Echoing Word | Spoken runes are re-carved at 50% for 6 s, then fade-pop again. |
| 22 | `runesmith_speak_the_runes_t2b` | Tithe of Stone | Refund 1.5% Mana per rune Spoken. |
| 32 | `runesmith_speak_the_runes_t3a` | Word of Iron | Each rune Spoken gives you 4% less damage taken for 8 s (stacks to 5). |
| 32 | `runesmith_speak_the_runes_t3b` | Word of Ruin | Each rune's damage +35%, but ground runes no longer taunt (the Breaker talent). |
| 45 | `runesmith_speak_the_runes_t4a` | Chain of Words | Runes go off one after another, 0.2 s apart, each +10% more than the last. |
| 45 | `runesmith_speak_the_runes_t4b` | The Unspoken | Holding the key 1 s Speaks **without emptying sockets**; 30 s cooldown for that use. |

(Renamed: *Tithe of Fury* → **Tithe of Stone**, now paid in Mana.)

### Calling Stone
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `runesmith_calling_stone_t1a` | Skipping Stone | Bounces to 2 more enemies within 8 m, taunting each (1.5 s). |
| 12 | `runesmith_calling_stone_t1b` | Lodestone | Pulls the struck target 6 m toward you (not bosses). |
| 22 | `runesmith_calling_stone_t2a` | Holding Fast | The Holding circle roots non-boss enemies for 2 s when carved. |
| 22 | `runesmith_calling_stone_t2b` | Stone Wall | Carves a 10 m × 1 m line instead of a circle, blocking non-boss enemy movement for 6 s. |
| 22 | `runesmith_calling_stone_t2c` | Rescue Stone | Becomes **Ally**-targeted: thrown at a party member, it taunts every enemy attacking them for 3 s. |
| 32 | `runesmith_calling_stone_t3a` | Second Stone | 2 charges. |
| 32 | `runesmith_calling_stone_t3b` | Heavy Stone | Stuns the target 1 s (bosses: interrupts one gold-bordered cast, once per 30 s). |
| 45 | `runesmith_calling_stone_t4a` | Portable Holding | The Holding rune follows you at your feet, so moving a boss out of a void zone keeps it. |
| 45 | `runesmith_calling_stone_t4b` | Boulder | A 3 m boulder rolls 20 m along the throw line, 150% WD and knockback (not bosses) to everything it rolls over. |

### Stoneblood Rune
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `runesmith_stoneblood_rune_t1a` | Deeper Stone | 50% reduction, but you move 20% slower during it. |
| 12 | `runesmith_stoneblood_rune_t1b` | Quick Stone | 60 s cooldown, 5 s duration. |
| 22 | `runesmith_stoneblood_rune_t2a` | Thorned Stone | Melee attackers take 30% WD each time they hit the wearer. |
| 22 | `runesmith_stoneblood_rune_t2b` | Shared Stone | While on you, allies within 8 m take 10% less damage. Adds `tag_aura`. |
| 32 | `runesmith_stoneblood_rune_t3a` | Last Carving | If you would die while it is ready, it triggers by itself at 1 health (once per 3 min). |
| 32 | `runesmith_stoneblood_rune_t3b` | Crackback | When the rune cracks, it also deals 200% WD in 6 m. |
| 45 | `runesmith_stoneblood_rune_t4a` | Mountain's Heart | Lasts 12 s: reduction starts at 60% and falls 5% per second. |
| 45 | `runesmith_stoneblood_rune_t4b` | Two Stones | 2 charges; casting on an ally is now 100% strength. |

### Ward Stone
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `runesmith_ward_stone_t1a` | Walking Ward | Becomes **Self**: the stone floats beside you and the 6 m circle follows you. |
| 12 | `runesmith_ward_stone_t1b` | Twin Wards | Two 5 m stones at two spots. |
| 22 | `runesmith_ward_stone_t2a` | Stone of Clarity | Allies inside are immune to fear, charm and sleep (does not free anyone already affected). |
| 22 | `runesmith_ward_stone_t2b` | Stone of Grounding | Allies inside cannot be pulled or knocked back at all. |
| 32 | `runesmith_ward_stone_t3a` | Absorbing Stone | Soaks (orange circles) inside the ward count **one extra player**. |
| 32 | `runesmith_ward_stone_t3b` | Fortress Stone | The ward blocks enemy projectiles crossing its edge (not boss beams). |
| 45 | `runesmith_ward_stone_t4a` | Standing Circle | 18 s, and the barrier on Speak is 20%. |
| 45 | `runesmith_ward_stone_t4b` | Stone Answers | Each ally hit inside the ward adds 1% to its Spoken barrier (cap +15%). |

### Grand Inscription
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `runesmith_grand_inscription_t1a` | Swift Carving | Cast time 0.8 s. |
| 12 | `runesmith_grand_inscription_t1b` | Thrown Inscription | Becomes **Ground**-targeted up to 25 m. |
| 22 | `runesmith_grand_inscription_t2a` | Circle of Law | Non-boss enemies inside cannot leave the circle until it is Spoken. |
| 22 | `runesmith_grand_inscription_t2b` | Circle of Rest | Allies inside regain 1.5% max health per second. Adds `tag_heal`. |
| 32 | `runesmith_grand_inscription_t3a` | Seven Runes | 7 rim runes, each line 150%. |
| 32 | `runesmith_grand_inscription_t3b` | Inscribed Ground | Your other ground runes carved inside it last twice as long. |
| 45 | `runesmith_grand_inscription_t4a` | World-Rune | Radius 20 m; the Speak also re-carves a Rune of Holding in the centre. |
| 45 | `runesmith_grand_inscription_t4b` | Final Word | When it fade-pops, it goes off at 100% instead of 50%. |

---

## 8. Class sets

### `set_runesmith_forgewardens_plate` — Forgewarden's Plate (levels 14–18, dungeon set)
Drops from `d03_shaft_seven` and `d04_bellows_keep` bosses on **Normal** (15% per boss, at the dungeon's level)
and on **Challenge** (item level 60); their Depth end chests can drop it too (page 12).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Etching Blow restores 4% Mana instead of 3%. | `runesmith_etching_blow` |
| 4 | Speak the Runes with 3+ runes also gives you a barrier of 10% max health. | `runesmith_speak_the_runes` |
| 6 | Calling Stone's Holding rune lasts 20 s and has an 8 m radius. | `runesmith_calling_stone` |

### `set_runesmith_rimefang_runes` — Runes of the Rimefang (levels 36–39, dungeon set)
Drops from `d10_rimefang_caverns` bosses on **Normal** (15%) and **Challenge** (item level 60), and from the
world boss of `frostmantle` (page 13, one random piece, 10%). *(Was "Runes of the Glacier Throne" from raid r02;
raids are in `WISHLIST.md`.)*

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Ground runes you carve slow enemies inside by an extra 10%. | all ground runes |
| 4 | Stoneblood Rune also carves a Rune of Warding (4 m) at your feet. | `runesmith_stoneblood_rune` |
| 6 | When Ward Stone is Spoken, it freezes non-boss enemies inside for 2 s. | `runesmith_ward_stone` |

### `set_runesmith_anvilborn_aegis` — The Anvilborn Aegis (level 60, endgame set)
Item level 60. Drops from **Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per boss;
page 12 names which) and from the **end chest of any dungeon at Depth 10 or deeper** (one random piece, 8%).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | +1 socket on the Rune Slate (max 6). | Rune Slate |
| 4 | Grand Inscription cooldown −30 s; its rim runes also taunt their line's targets. | `runesmith_grand_inscription` |
| 6 | Every Runeforged grants the whole party 8% less damage taken for its duration. | Runeforged |

(Renamed: `set_runesmith_glacier_runes` → `set_runesmith_rimefang_runes`; `set_runesmith_emberforged_aegis`
The Emberforged Aegis → `set_runesmith_anvilborn_aegis` **The Anvilborn Aegis**.)

---

## 9. Class legendaries, uniques and souls

### Legendaries
| id | Name | Slot | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_first_hammer_of_anvilgate` | First Hammer of Anvilgate | one-hand hammer | Etching Blow brands **every** enemy in the arc using only one socket; the brands share their timer. | `b_grumvak_kilnbreaker` (`d04_bellows_keep` end boss) on Challenge, 4%; its Depth end chest 2% |
| `leg_slate_of_unwritten_names` | Slate of Unwritten Names | off hand (shield) | Sockets 7. Runes carved past 5 cost no Mana on Speak. Blocks give +2 s to all runes. | a Challenge-mode `d16_the_spire` boss (page 12 names which), 5% |
| `leg_ironroot_greaves` | Ironroot Greaves | legs | While standing in your own ground rune, you take 12% less damage and regenerate an extra 0.5% Mana per second. | the world boss of `frostmantle` (page 13), once a week, 6% |
| `leg_mountains_patience` | The Mountain's Patience | chest | Stoneblood Rune gains 1 s per rune Spoken while it is active (cap +8 s). | `b_rimefang` (`d10_rimefang_caverns` end boss) on Challenge, 4% |
| `leg_the_last_word` | The Last Word | two-hand hammer | Speak the Runes with 5+ runes deals an extra 25% WD per rune to the highest-health enemy. | `b_sarn_veydrec_herald` (`d14_ashen_reliquary` end boss) on Challenge, 4%; end chest at **Depth 15+**, 1% |

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_chisel_of_the_deep` | Chisel of the Deep | one-hand hammer | +10% Mana regeneration. Brands last 20 s. | `b_stonegullet` (`d03_shaft_seven` end boss) |
| `uq_runecarvers_bracers` | Runecarver's Bracers | hands | Fade-pops happen at 75% instead of 50%. | `d06_sandsworn_vault` boss 2 |
| `uq_stone_of_the_clan_hall` | Stone of the Clan Hall | off hand (shield) | Calling Stone's taunt lasts 5 s; block chance +5%. | `b_grief_in_iron` Grief-in-Iron (`greyridge` world boss) |
| `uq_wardwell_girdle` | Wardwell Girdle | waist | Ward Stone's barrier is also applied to you when you are outside it. | `b_deacon_mourne` (`d11_saltdeep_cathedral` boss 1) |

### Souls
A soul goes in a **Soul** socket (page 08) and adds a behaviour. Both need the wearer to be a **runesmith**.

| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_clan_elder` | Soul of the Clan Elder | armour — shield or chest | class: runesmith | When a Rune of Defiance **fade-pops** on its own (not Spoken), it carves a fresh Rune of Defiance on the same enemy at 50% for 8 s (no socket used). The brand chain keeps ×3 threat up through a long move phase. | `b_bellamund_the_cold_smith` (`d04_bellows_keep` secret boss) on Challenge, 3%; the world boss of `greyridge`, 2% |
| `soul_unbroken_anvil` | Soul of the Unbroken Anvil | weapon | class: runesmith | Every **third** Speak the Runes also rings the anvil: a 10 m shockwave for 60% WD per rune Spoken (`tag_arcane` `tag_spell` `tag_area`), and each ally inside restores 2% Mana (Tempo / Momentum: 6 points). | end chest at **Depth 15+**, 1%; `b_first_flame_of_the_gate` (`d13_cindergate` secret boss) on Challenge, 3% |

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
| Out of Mana | "The forge is cold." |
| Death | "Carve my name… somewhere…" |

---

## 11. Reuse notes

| Wildmarch piece | Borrowed from | Notes |
|---|---|---|
| Etching Blow swing | Farhold `power_strike` / `sunder` melee arc logic, Chibi 2 overhead clip | visuals + arc rule |
| Stoneblood | Farhold `stoneskin` status look | stronger, new numbers |
| Ward Stone | Farhold `guard_stance` holy ground disc | teal tint |
| Grand Inscription beams | spellfx beam (`storm_beam`) | teal palette |
| Mana from melee hits | `(new)` — Farhold has no on-hit Mana gain | a melee Mana class needs it (paladin too) |
| Outfit | `avatar-3d/data/class-outfits.json` `runesmith` (rune helm, plate, rune bracers) | |
| Talent engine | `prototypes/farhold/js/skilltalents.js` | Wildmarch tier levels |
| Emberveil 2 prototype ideas | `rune_hammer`, `rune_of_warding`, `rune_of_might`, `forge_flame` | reborn as Etching Blow, Ward Stone, Grand Inscription, Weapon Rune |
