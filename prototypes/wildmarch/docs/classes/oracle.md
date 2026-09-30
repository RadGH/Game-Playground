# Class: Oracle (`oracle`)

> *"I have seen how this ends. Step left."*

**Page owner:** `06-CLASSES.md` + this file. Canon: [page 00](../00-OVERVIEW.md) §6 row 18.
**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Documentation only — nothing is built.
Follows the class template in [page 00 §5](../00-OVERVIEW.md). Canon facts used (page 00 §6): primary role
**Healer**, hybrid role **Support**, build **caster**, **cloth** armour, resource **Mana**, mechanic **Foresight —
sees boss telegraphs early; pre-shields**, utility **Guiding Call** (an assisted teleport: pull one party member to
you; arriving counts as discovering), spell slots 1 / 4 / 10 / 18 / 28 / 40, calling quests 6 / 20 / 40, talent
tiers 12 / 22 / 32 / 45, cap 60. The dashed pale cyan `#7fe8ff` is reserved for the Oracle (00 §10).

## How to read the numbers on this page

| Term | Meaning |
|---|---|
| **SP** | Spell power: the caster's damage and heal base (page 05 owns the formula; Farhold shape `WD × mult × (1 + spellPower)`, reuse `farhold/js/skills.js`). |
| **Mana** | the class resource (canon: a big pool that refills slowly; page 05 owns pool size and regeneration). Costs are **% of maximum mana**. |
| **Shield** | absorbs damage before health; stated in % SP. Shields from different casters stack; the same spell refreshes. |
| **Telegraph** | the ground/body warning drawn before a boss or elite attack lands (page 11 owns the colours and shapes). |
| **Lead** | how many seconds **before** the real telegraph the Oracle sees it (§2.1). |
| **Targeting** | page 02 / 00 §12.1 W8: **Needs target** · **Auto-target** (no valid target → the valid enemy closest to your aim point in range) · **Self** · **Ally** (`F1` yourself, `F2`–`F5`) · **Ground**. Heals and shields **need** a friendly target. |
| **Tags** | page 05 §Tags. The Oracle's spells are arcane: they carry `tag_arcane` `tag_spell`; heals add `tag_heal`, shields `tag_shield`. |
| **GCD** | 1.0 s global cooldown (canon). |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A seer who reads the next few seconds of the fight. Where everyone else sees a red circle appear, the Oracle has already watched its ghost for two seconds and put a shield on the one who will stand in it. |
| Primary role | **Healer** |
| Hybrid role | **Support** — the **Seer** (§5): marks the enemy's doom for the party, lends the vision, and pulls people out of harm |
| Build | caster |
| Armour | Cloth |
| Weapons | Staff, sceptre (+ an orb or tome focus with a sceptre — reuse Farhold `js/foci.js`, `seer_orb` fits perfectly). Starter: **Novice's Sceptre + Cracked Seer's Orb**. |
| Primary attribute | INT |
| Resource | **Mana** + **Omens** (§2.2) |
| Companion | None. |
| Playstyle | Watch the ghosts, pre-shield the right person, tug allies out of danger before danger exists, and bank Omens for instant big heals when the prediction comes true. Out of combat, call the party to you so they discover the places you have found. |

---

## 2. Class mechanic: **Foresight** and **Omens**

### 2.1 Foresight — exactly what the Oracle sees

Foresight is a **second, earlier copy** of every warning the game already draws. It never replaces the real
telegraph and never shortens anyone else's warning (page 11 minimums still apply).

| Calling | Lead | What is shown |
|---|---|---|
| I (6) | **1.5 s** | ghost telegraphs for **boss and elite** attacks · **intent glyphs** over normal enemies |
| II (20) | **2.5 s** | + the **Next line** on the boss frame · + the **seer's eye** on the player a targeted attack will pick |
| III (40) | **3.5 s** | + **Share the Vision** (the whole party sees ghosts for 12 s) · + one wrong answer struck through in a boss **dialog opportunity** |

**Ghost telegraph** — drawn at the lead time before the real one:

* **Same shape, size and position** as the telegraph that is coming (circle, donut, cone, line, cross,
  checkerboard, wave).
* Drawn as a **pale cyan (`#7fe8ff`) dashed outline, 2 px, 40% opacity, no fill**, with a slow shimmer (the dashes
  crawl clockwise at 1 revolution per 4 s). **Dashed, never solid**, so it can never be mistaken for any real
  telegraph colour (page 11: red, purple, orange, blue, yellow, green, white are all solid).
* A **thin cyan countdown ring** at the shape's centre fills clockwise over the lead time. When it closes, the ghost
  fades over 0.2 s and the real, solid telegraph appears in its real colour.
* **Per kind:**

| Real telegraph (page 11) | Ghost shows |
|---|---|
| **Danger zone** (red fill from the edge) | the outline + small cyan **arrows** pointing the way the fill will grow |
| **Void zone** (purple swirl) | **dotted** cyan circles where each void zone will spawn; if it will grow, a second dotted ring at its final size |
| **Soak** (orange, N pips) | the outline with **N hollow cyan pips** |
| **Safe zone** (blue ring) | the ring drawn **double** (two dashed lines 0.3 m apart) — "go here" |
| **Targeted** (yellow, one player) | a cyan **seer's eye** glyph floats 1 m above the chosen player's head (from Calling II); their party frame gets a cyan border; the Oracle's alert line reads **"Foreseen: Tidebreak → Aria (2.5 s)"** |
| **Beneficial** (green) | outline + a small leaf glyph |
| **Tether** (white line) | a dashed cyan line between the two bodies that will be tethered |
| **Moving wave** | the start line + a dotted arrow along its path to where it ends |
| **Room-wide** | no shape: the Oracle's screen edges pulse cyan 3 times and the centre text reads "Room-wide in 3.5 s" |

**Intent glyphs** (normal, non-elite enemies within 30 m) — a 16 px icon over the head that appears at the lead
time before the action:

| Glyph | Meaning |
|---|---|
| crossed swords | about to swing at someone (the glyph leans toward the victim) |
| swirl | starting a spell cast |
| arrow | about to shoot |
| shield | about to block / raise a guard |
| running figure | about to flee or call for help |
| red skull | about to enrage or explode on death |

**The Next line** (Calling II) — under the boss's cast bar, grey italic: **"Next: Tidebreak — 4.2 s"**, counting
down. It names the next *telegraphed* ability only (no hidden timers, no random choices that have not been rolled
yet — if the server has not decided, the line reads "Next: unclear").

**Boss dialog warnings** — when a boss line is itself the warning (page 11), the Oracle sees the line in her chat as
*"(foreseen) 'The tide answers me!'"* at the lead time before the boss says it.

**Dialog opportunities** (Calling III) — when a boss offers replies (parley, riddle), the Oracle sees **one** wrong
reply struck through for her alone. She can say it in chat; the game does not share it. In a group the party
votes on the reply (00 §10), so the Oracle's job is to tell them. (**See QUESTIONS.md C11** — kept.)

**Settings** (page 04 owns): `set.interface.foresight_opacity` (20–80%, default 40) ·
`set.interface.foresight_color` (Cyan / White / Magenta for colour-blind players, default Cyan) ·
`set.audio.foresight_chime` (0–100, default 60). Each ghost plays a **0.2 s soft glass chime** placed in 3D at the
shape's centre.

**Server note (page 16):** the server sends upcoming telegraphs to an Oracle's client only at her lead time, and
only for enemies within 60 m of her — so a modified client cannot see further ahead than the class does.

### 2.2 Omens

* **0–3 Omens** (Calling I), **0–5** (Calling II). Shown as closed eyes above the mana bar; a filled Omen is an
  open, glowing eye.
* **Gained** when (a) a shield you cast absorbs damage from an attack you **foresaw**, or (b) an ally who was inside
  a ghost telegraph is **outside it when the real telegraph appears** (they moved early — prediction rewarded).
  Max one Omen per telegraph.
* **Spent** automatically by the next heal you cast (Mended Thread, Foretold Ward): the heal is **instant** and
  **+50%**. Hold **`G`** while casting to save the Omen instead (setting `set.gameplay.oracle_omen_auto`, default
  on). From Calling II an Omen can also be spent on the non-heals (§4).
* Omens fade one per 10 s out of combat.

### 2.3 Class keys ([page 02](../02-CONTROLS.md) §5.16)

| Key | From | Does |
|---|---|---|
| `Q` | Calling III (40) | **Share the Vision**: for **12 s**, every party member within **40 m** sees ghost telegraphs at **1.5 s** lead (not the Oracle's full 3.5 s). Cooldown **90 s**. A cyan eye opens above the Oracle and a thin thread runs to every ally for 0.5 s. |
| `G` (hold while casting) | Calling I (6) | **keep the Omen** (do not spend it on this cast) |

### 2.4 The calling quests (page 14 owns text; ids per 00 §10)

| Level | Quest id | Name | Where | Grants |
|---|---|---|---|---|
| 6 | `q_calling_oracle_1` | **The First Sight** | Hearthvale — the blind well-keeper of Brightwater; drink from the well and walk a path of falling rocks you see *before* they fall | Foresight at 1.5 s, intent glyphs, Omens (3) |
| 20 | `q_calling_oracle_2` | **The Long Sight** | Sunscar — read the future in the glass of the tombs; guide an NPC caravan through a canyon of ambushes by calling each one out | lead 2.5 s, the **Next line**, the **seer's eye**, Omens (5) |
| 40 | `q_calling_oracle_3` | **The Shared Sight** | Frostmantle — lead four NPC followers blindfolded across a crevasse field; they only see what you show them | lead 3.5 s, **Share the Vision**, the struck-through dialog reply |

### 2.5 JSON shape

```json
{
  "id": "oracle",
  "foresight": { "leadByCalling": [1.5, 2.5, 3.5], "radius": 60, "ghostColor": "#7fe8ff",
                 "ghostOpacity": 0.4, "dash": true, "intentRadius": 30 },
  "omens": { "maxByCalling": [3, 5, 5], "healBonus": 0.5, "instant": true, "fadeSeconds": 10 },
  "shareVision": { "seconds": 12, "lead": 1.5, "radius": 40, "cooldown": 90 },
  "foretoldDoom": { "seconds": 8, "partyDamage": 0.10, "leadForParty": 2.5 },
  "guidingCall": { "unlockLevel": 12, "castSeconds": 5, "acceptSeconds": 60, "arriveWithin": 3,
                   "cooldown": 300, "discoverRadius": 40 }
}
```

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | CD | Cast | Target | Range / shape | Tags | Does |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `oracle_foretold_ward` | Foretold Ward | 3% | 6 s | instant | Needs target (ally) | 40 m | `tag_arcane` `tag_spell` `tag_shield` `tag_duration` | 180% SP shield, 12 s; doubles on a foreseen hit |
| 2 | 4 | `oracle_thread_cut` | Thread-Cut | 2% | — | 1.5 s | Auto-target | 30 m bolt | `tag_arcane` `tag_spell` `tag_projectile` `tag_heal` | 160% SP; heals the lowest ally 60% of it |
| 3 | 10 | `oracle_mended_thread` | Mended Thread | 4% | — | 1.8 s | Needs target (ally) | 40 m | `tag_arcane` `tag_spell` `tag_heal` `tag_duration` | 320% SP heal + 120% over 6 s |
| 4 | 18 | `oracle_fates_tug` | Fate's Tug | 3% | 20 s | instant | Needs target (ally, or a non-boss enemy) | 30 m | `tag_arcane` `tag_spell` `tag_movement` | pulls them to you; an ally takes 50% less damage 3 s |
| 5 | 28 | `oracle_circle_of_prophecy` | Circle of Prophecy | 8% | 60 s | 1.5 s | Ground | 30 m, 8 m circle, 10 s | `tag_arcane` `tag_spell` `tag_area` `tag_duration` `tag_heal` | allies inside see ghosts, −12% damage, heal |
| 6 | 40 | `oracle_unwritten_hour` | The Unwritten Hour | 10% | 180 s | instant | Self | every ally within 40 m, 6 s | `tag_arcane` `tag_spell` `tag_area` `tag_heal` `tag_duration` | nobody dies for 6 s; reveals the next 2 abilities |

### 3.2 Details

**1. `oracle_foretold_ward` — Foretold Ward** · level 1 · 3% mana · 6 s · instant · **Needs target** (ally or yourself) · 40 m
* A shield absorbing **180% SP** for **12 s**.
* If the hit that breaks it came from an attack you **foresaw**, the shield absorbs **up to 360% SP** for that hit,
  and you gain an **Omen**.
* Tags: `tag_arcane` `tag_spell` `tag_shield` `tag_duration`.
* Looks: a thin glass sphere with turning runes (`STATUS_FX.barrier`, recoloured cyan-gold); on a foreseen block it
  shatters in a spray of cyan light. Sound: a glass chime; a bright shatter.

**2. `oracle_thread_cut` — Thread-Cut** · level 4 · 2% mana · no cooldown · 1.5 s cast · **Auto-target** · 30 m bolt
* **160% SP** arcane. The **lowest-health ally within 30 m** of you is healed for **60% of the damage dealt**
  (yourself when alone).
* Tags: `tag_arcane` `tag_spell` `tag_projectile` `tag_heal`.
* Looks: a golden thread flies (`projectile` arcane recoloured gold, `ribbon` shape), snaps on the target; a second
  thread flies from the target to the healed ally. Sound: a harp pluck, a snip.

**3. `oracle_mended_thread` — Mended Thread** · level 10 · 4% mana · no cooldown · 1.8 s cast · **Needs target** (ally) · 40 m
* Heals **320% SP**, then **120% SP over 6 s**.
* **With an Omen:** instant and **+50%** (480% + 180%).
* Tags: `tag_arcane` `tag_spell` `tag_heal` `tag_duration`.
* Looks: golden threads stitch across the ally's body (`heal()` + thread lines). Sound: a soft rising three-note
  harp run.

**4. `oracle_fates_tug` — Fate's Tug** · level 18 · 3% mana · 20 s · instant · **Needs target** · 30 m
* **Ally:** pulled along a 0.4 s arc to a spot **3 m in front of you** (over low walls and gaps), then takes
  **50% less damage for 3 s**. Cannot pull someone out of a boss "trapped" mechanic that page 11 marks immune.
* **Non-boss enemy:** pulled to you and **Dazed 1 s**.
* Tags: `tag_arcane` `tag_spell` `tag_movement`.
* Looks: a golden hook-thread, the ally trailing cyan afterimages. Sound: a taut string twang.

**5. `oracle_circle_of_prophecy` — Circle of Prophecy** · level 28 · 8% mana · 60 s · 1.5 s cast · **Ground** within 30 m · **8 m** circle, **10 s**
* Allies inside **see ghost telegraphs at 1.5 s lead** (the Oracle's vision, for anyone standing in it), take
  **12% less damage**, and heal **30% SP a second**.
* Tags: `tag_arcane` `tag_spell` `tag_area` `tag_duration` `tag_heal`.
* Looks: a floor mosaic of an open eye in gold (`pillar` holy recoloured gold, low), slow-turning runes. Sound: a
  sustained glass-harmonica chord.

**6. `oracle_unwritten_hour` — The Unwritten Hour** · level 40 · 10% mana · 180 s · instant · **Self** · every ally within **40 m** · **6 s**
* Any ally who would die is instead set to **1 health** and healed **40% of max health over 3 s** (once per ally
  per cast).
* For **20 s** the boss frame's Next line shows the next **two** abilities.
* Tags: `tag_arcane` `tag_spell` `tag_area` `tag_heal` `tag_duration`.
* Looks: the world desaturates to 60% for everyone in range for 0.5 s, then a clock-face of light turns once above
  each ally. Sound: a deep bell, time "catching" with a reversed whoosh.

### 3.3 How it plays

* **Solo:** Thread-Cut is the damage spell (and heals you as "lowest ally" when alone). Foretold Ward on yourself
  (`F1`) before every elite telegraph you see coming; intent glyphs tell you which normal enemy is about to swing —
  roll that one. Omens from warded hits make the emergency heal instant.
* **Dungeon (Healer):** Ward the tank on cooldown, but **save one Ward for the ghost**: when a targeted ghost's
  seer's eye appears over the mage, Ward the mage. Tug the player who has not noticed the ghost. Mended Thread with
  Omens is the big heal. Call out targeted players in chat — the Oracle knows 2.5 s before anyone else.
* **Challenge mode and Depth:** **Circle of Prophecy** where the melee stack gives them your vision; **Share the
  Vision** (40) on the hardest pattern phase (checkerboards, moving waves); **The Unwritten Hour** is the party's
  "nobody dies for 6 s" button — time it with the ghost of a room-wide attack (you see it 3.5 s early; cast it 1 s
  before the real warning).

### 3.4 Boss mechanics

| Mechanic | Oracle answer |
|---|---|
| **Danger zone** | seen 1.5–3.5 s early; Fate's Tug pulls the slow player out; the Omen rewards allies who moved early |
| **Void zone** | dotted spawn points shown early — call "void left!" before it exists |
| **Soak** | ghost with pips: pre-shield the soakers with Foretold Ward (a foreseen soak = doubled shield) |
| **Targeted** | the seer's eye shows who, 2.5 s early; Ward them, Tug them away from the group |
| **Tether** | the dashed cyan line shows the pair; tell them to spread before it forms |
| **Enrage** | the Next line names it; Unwritten Hour for the last seconds |
| **Dialog opportunity** | one wrong reply struck through (Calling III) |
| **Interrupts** | the Oracle has no interrupt, but the Next line tells the party **which** cast is coming, so the interrupters are ready |

---

## 4. Alternate spells — Omen-empowered

The Oracle has no second bar; an **Omen** changes the next heal. From Calling II, spending an Omen on a non-heal
also works:

| Spell | Omen version |
|---|---|
| Foretold Ward | instant, shield 180 → 270% SP, and it goes on **two** allies (target + lowest nearby) |
| Thread-Cut | cast instantly, heals **all** allies within 8 m of the lowest one, and marks the enemy with **Foretold Doom** (§5.1) |
| Mended Thread | instant, +50% (above) |
| Fate's Tug | no cooldown used (the next Tug is ready at once) |
| Circle of Prophecy | instant cast, lead 1.5 → 2.5 s for those inside |
| The Unwritten Hour | Omens are not spent on it |

---

## 5. The hybrid role — Support (the Seer)

The Oracle uses the canon **Role focus** switch (00 §6; spellbook, out of combat, saved per Loadout). Set to
**Hybrid (Support)** from level 6, it makes an Omen spent on Thread-Cut mark **Foretold Doom** (§5.1) and the
Dungeon Finder queue you as Support, which counts as a **Damage** slot (canon §4). The six spells are unchanged.
Its support is **information and timing** turned into damage and safety for the party.

### 5.1 Foretold Doom (the support engine)

| Rule | Value |
|---|---|
| Applied by | an **Omen spent on Thread-Cut** (§4). In a support build Omens come as often as in a healing build — every foreseen block and every ally who steps out of a ghost early. |
| Effect | for **8 s** the target takes **+10% damage from the whole party**, and its **next telegraphed ability** is shown to every party member as a ghost at **2.5 s** lead (the Oracle's vision, for that one attack) |
| Stacking | one Doom per target; recasting refreshes it |
| Look | a cyan eye with a crack through it floats over the target; the party's target frame shows a cracked-eye icon |
| Tags | Thread-Cut keeps its tags; Doom itself is a debuff (`tag_curse`, so curse bonuses and curse dispels apply) |

### 5.2 The support kit

| Piece | What it does for the party |
|---|---|
| Foretold Doom | +10% party damage on the boss for 8 s of every ~12–15 s (about 55–65% uptime with Thread-Cut t3b **Fate Knot**) and a shared early warning |
| Circle of Prophecy | the party's vision on the stack point, −12% damage taken |
| Share the Vision (40) | 12 s of ghosts for everyone |
| Fate's Tug | pulls a player out of a mechanic (or an add to the tank) |
| The Unwritten Hour | a party-wide save; t4b **Stopped Clock** pauses a boss cast for 2 s (the shared 90 s cast-pause lockout, 00 §10) |
| Thread-Cut talents | t2a **Frayed** (+10% party damage on the target for 6 s, stacks with Doom only to +15%), t2b **Needlepoint**, t3a **Snip** (non-boss interrupt), t4b **Scissors of Ending** |
| Gear | the same INT gear; spell power and crit over healing |

### 5.3 How good it is

A support Oracle does about **70%** of a damage class's damage and adds about **+6–8% party damage** on the boss
(Doom + Frayed), a shared early warning on the boss's next ability every 8 s, and **−12%** damage taken inside the
Circle. That is excellent in the **open world, Normal dungeons and Depth up to about 10**, and the information side
stays useful everywhere. In **Challenge mode** the lack of an interrupt and the thin personal damage show; a
Challenge party is usually better served with the Oracle as its healer.

---

## 6. Utility spells

### 6.1 `oracle_guiding_call` — Guiding Call (00 §6; page 20 owns the travel rules)

An **assisted teleport**: the Oracle calls one party member to where she stands. Its real job is **discovery** —
a dungeon shows in the Dungeon Finder only once a character has discovered its entrance (00 §8, W9), and a
waystone can only be travelled to once found. An Oracle who has walked to a place can call the rest of the party
there one by one, and **arriving counts as discovering** it.

| Field | Value |
|---|---|
| Unlocks | **level 12** (when waystones and Travel Methods open, page 07) |
| Uses a slot | no — it is on the **spellbook's Utility tab** (`K`), draggable to any spare bar key |
| Cost | none |
| Target | **Needs target** — one **party member** (`F2`–`F5` or their frame); anywhere on the Wildmarch's open world |
| Cast | the Oracle channels **5 s**, out of combat; moving or taking damage cancels it |
| The ally | gets a prompt (`scr_summon_prompt`): **"{Oracle} is calling you to {place}. Go? — Accept / Decline"**, open **60 s** (`set.gameplay.autoAcceptSummon` can accept automatically from party members). On Accept they arrive **beside the Oracle (within 3 m)** with a gold thread fading from their chest. If they were riding a Travel Method, accepting takes them off it (the fare is not refunded) |
| Discovery | **arriving counts as being there**: any **dungeon entrance within 40 m** of the Oracle, and the **waystone and station** of the town she stands in, are discovered for the arriving ally, with the normal discovery card and XP (page 07) |
| Cooldown | **5 minutes** for the Oracle (page 20 §16.3) |
| Refused when | the Oracle is in combat or the ally is in combat, **inside a dungeon or any instance** (the Oracle may stand at a dungeon's **entrance**, outside it), in a world boss arena during its fight, in the air, dead, or not in your party; the prompt says which |
| Not a portal | it moves one person, never the Oracle herself and never a group (the Mage's Portal and the Chronomancer's Retrace are the group tools; page 20) |
| Tags | `tag_arcane` `tag_movement` `tag_travel` (no damage) |
| Looks / sound | a pillar of gold thread at the Oracle (`pillar` holy recoloured gold); at the ally, threads wrap them and pull upward. A long harp glissando |

No other utility spells. The Oracle also uses scrolls and the Recall Stone (page 20).

---

## 7. Talents

Ids `<spellid>_t<tier><a|b|c>`. Tiers 12 / 22 / 32 / 45; a tier opens at the later of its level and the spell's
slot level.

| Spell | Tier | a | b | c |
|---|---|---|---|---|
| Foretold Ward | 1 | **Twin Ward** — 2 charges | **Lingering Ward** — 12 → 20 s, 180 → 140% | — |
| Foretold Ward | 2 | **Retort** — a foreseen block deals the absorbed amount back to the attacker as arcane | **Ward Chain** — when it breaks, a 50% ward jumps to the nearest ally within 10 m | **Stillness** — the warded ally cannot be knocked back |
| Foretold Ward | 3 | **Pre-Ward** — cast on a **ghost telegraph** (Ground targeting) instead of an ally: every ally in the real shape gets a 150% SP shield the moment it lands | **Omen Ward** — a foreseen block gives 2 Omens | — |
| Foretold Ward | 4 | **Perfect Foresight** — a foreseen hit is absorbed **completely** if it is under 60% of the ally's max health | **Warded Path** — the warded ally moves +25% while shielded | — |
| Thread-Cut | 1 | **Split Thread** — 2 bolts, 90% each, each heals separately | **Long Thread** — 30 → 45 m, cast 1.5 → 2.0 s | — |
| Thread-Cut | 2 | **Frayed** — the target takes +10% damage from your party for 6 s (with Foretold Doom, the two together cap at +15%) (`tag_curse` added) | **Needlepoint** — hits a second enemy behind the first (a 10 m line) | **Mending Cut** — the heal goes to the 2 lowest allies, 40% each |
| Thread-Cut | 3 | **Snip** — interrupts a non-boss cast | **Fate Knot** — every 3rd cut grants an Omen | — |
| Thread-Cut | 4 | **Loom** — cast while moving | **Scissors of Ending** — +100% on enemies under 20% health | — |
| Mended Thread | 1 | **Quick Stitch** — cast 1.8 → 1.2 s, heal −20% | **Heavy Thread** — cast 1.8 → 2.5 s, heal +40% | — |
| Mended Thread | 2 | **Seam** — also heals one ally within 8 m of the target for 50% | **Undo the Wound** — removes one Bleeding / Poisoned / Cursed | — |
| Mended Thread | 3 | **Stitch in Time** — if the ally takes a foreseen hit within 4 s after, the over-time part triples | **Rewind** — the heal is **the damage the ally took in the last 3 s** if that is more | — |
| Mended Thread | 4 | **Spool** — overhealing is kept as a shield (max 100% SP) (`tag_shield` added) | **Twin Mending** — heals the target and the Oracle both in full | — |
| Fate's Tug | 1 | **Long Tug** — 30 → 45 m | **Double Tug** — 2 charges | — |
| Fate's Tug | 2 | **Swap** — you and the ally swap places instead | **Safe Harbour** — pulled allies are healed 150% SP (`tag_heal` added) | **Enemy Hook** — on an enemy, pull + Silenced 2 s |
| Fate's Tug | 3 | **Tug of Fate** — tug an ally **to a ghost safe zone** you target (up to 20 m from them) | **Group Tug** — pulls every ally within 4 m of the target | — |
| Fate's Tug | 4 | **Untouchable** — the pulled ally cannot be damaged for 1 s | **Thread Guard** — a tugged ally's next foreseen hit is absorbed by you instead | — |
| Circle of Prophecy | 1 | **Wide Circle** — 8 → 12 m | **Moving Circle** — follows you at walking pace | — |
| Circle of Prophecy | 2 | **Deep Sight** — lead inside 1.5 → 2.5 s | **Sanctum** — damage reduction 12 → 20%, no heal | **Seer's Well** — your mana regeneration ×2 inside |
| Circle of Prophecy | 3 | **Omen Font** — gain an Omen every 3 s you stand inside | **Clear Eyes** — allies inside cannot be Blinded, Confused or Feared | — |
| Circle of Prophecy | 4 | **Prophet's Floor** — lasts 10 → 20 s | **Rings of Fate** — becomes 3 small circles (4 m) you place in one cast | — |
| The Unwritten Hour | 1 | **Long Hour** — 6 → 9 s | **Swift Hour** — cooldown 180 → 120 s, 6 → 4 s | — |
| The Unwritten Hour | 2 | **Written Anew** — allies saved are also cleansed of every harmful status | **Borrowed Time** — allies saved gain +20% damage 8 s | — |
| The Unwritten Hour | 3 | **Third Sight** — the boss frame shows **three** next abilities for 20 s | **Every Hour** — each ally saved lowers the cooldown by 10 s | — |
| The Unwritten Hour | 4 | **Last Morning** — also revives one dead ally at 30% health | **Stopped Clock** — the boss's current cast bar pauses for 2 s (not enrage); shares the one 90 s per-boss cast-pause lockout (**Resolved (00 §10)**) | — |

---

## 8. Class sets

Cloth pieces (head, chest, hands, legs, feet) + a sceptre or focus.

### 8.1 `set_oracle_seers_vestments` — Seer's Vestments (dungeon set, 19–24)

Drops from `d05_glass_tombs` bosses (head, chest, orb `it_seers_glass_orb`) and `d06_sandsworn_vault` bosses (hands,
legs, feet) on **Normal** at the dungeon's level and on **Challenge** at item level 60; Depth runs can drop it too
(page 12).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Foretold Ward's foreseen-hit bonus is ×2 → ×2.5 | Foretold Ward |
| 4 | Thread-Cut heals the lowest ally for 60 → 100% of its damage | Thread-Cut |
| 6 | Spending an Omen on Mended Thread also casts Foretold Ward on the target | Mended Thread, Ward |

### 8.2 `set_oracle_threadwoven_raiment` — Threadwoven Raiment (endgame set)

Item level 60. Drops from **Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per boss; page 12
names which) and from the **end chest of any dungeon at Depth 10 or deeper** (one random piece, 8%). *(Was a raid
set; raids are in `WISHLIST.md`.)*

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Foresight lead **+0.5 s** | the mechanic |
| 4 | Fate's Tug's pulled ally leaves a thread: for 6 s you can Tug them **back** to where they were (free) | Fate's Tug |
| 6 | Circle of Prophecy casts **The Unwritten Hour's** save on allies inside (once per Circle), not on its cooldown | Circle, Unwritten Hour |

---

## 9. Class legendaries, uniques and souls

### 9.1 Legendaries

| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_eye_of_the_ninth_morning` | Eye of the Ninth Morning | head, cloth | **Forecast:** party frames show a cyan bar of the damage each ally will take from foreseen attacks (a server estimate, ±10%); lead +0.5 s | the end chest of any dungeon at **Depth 15+** (1.5%) |
| `leg_spindle_of_fates` | Spindle of Fates | sceptre | Thread-Cut's thread continues: it jumps to **2 more enemies** (70%) and each jump heals a different ally | `b_bishop_aldwine` Bishop Aldwine, the Drowned (`d11_saltdeep_cathedral` end boss) on Challenge, and its Depth end chest |
| `leg_hourglass_of_ashes` | Hourglass of Ashes | off-hand focus (orb) | The Unwritten Hour's cooldown is reduced **3 s per Omen gained** | a Challenge-mode `d15_fire_court` boss (page 12 names which) |
| `leg_mantle_of_the_other_road` | Mantle of the Other Road | chest, cloth | Once per **60 s**, when an ally takes a hit you did **not** foresee over 40% of their health, you are shown it **1 s late** and it is **undone** — the damage is healed back (the "other road") | `b_sallow_king` The Sallow King (Drowned Coast world boss) |
| `leg_prophets_bell` | The Prophet's Bell | necklace | Share the Vision grants the **full** lead (not 1.5 s) and lasts 12 → 18 s | `b_old_mother_rime` Old Mother Rime (`d10_rimefang_caverns` secret boss) on Challenge |

### 9.2 Uniques

| id | Name | Slot / base | Fixed affixes | Power | Drop source |
|---|---|---|---|---|---|
| `uq_farsight_lens` | Farsight Lens | off-hand focus (reuse `foci.js` `seer_orb`) | +8 INT, +12 mana | Intent glyphs are shown 30 → 60 m away and include elites | `b_old_pike_sluicewarden` Old Pike, the Sluicewarden (`d02_drowned_mill` sub-boss) |
| `uq_threadbare_slippers` | Threadbare Slippers | feet, cloth | +6 INT, +8% move | After Fate's Tug, **you** move +40% for 3 s | `b_wyllow_blighted_heart` Wyllow, the Blighted Heart (`d07_thornheart` end boss) |
| `uq_omen_bell` | Omen Bell | necklace | +6 INT, +6% healing | Every Omen gained rings a bell that heals allies within 10 m for 40% SP | `b_oruvel_moon_drinker` Oruvel, That Which Drank the Moon (`d08_moonwell_ruins` end boss) |
| `uq_glasswalker_sceptre` | Glasswalker's Sceptre | sceptre | +8 INT, +8% spell power | Foretold Ward can be cast on a **ghost telegraph** (as tier-3 Pre-Ward) at half strength | `b_glass_wyrm` The Glass Wyrm (Sunscar world boss) |

### 9.3 Souls

Both need the wearer to be an **oracle**.

| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_second_sight` | Soul of Second Sight | armour — head | class: oracle | When the **seer's eye** appears over an ally (a targeted attack is coming for them), Foretold Ward is cast on them automatically at **60%** strength — no mana, no cooldown used (once every 20 s). | `b_ithar_the_unseen` Prince Ithar, the Unseen (`d05_glass_tombs` secret boss) on Challenge (3%); `b_glass_wyrm` world boss (2%) |
| `soul_doomsayer` | Soul of the Doomsayer | weapon | class: oracle | **Foretold Doom** also makes the target's next foreseen attack deal **30% less** damage, and Doom lasts 8 → 12 s. | end chest at **Depth 15+** (1%); `b_sallow_king` world boss (2%) |

---

## 10. Voice and barks

`voiceFor({ role: 'oracle', gender, seed })` (reuse `ROLE_VOICES.oracle`: pitch 0.6, tone 0.8, breath 0.45,
speed 0.38 — slow and airy). Foresight barks are **spoken early** — the Oracle says a line at the ghost time, not at
the real telegraph time. That is the fantasy and a real aid for groups.

| Moment | Lines (Lingo pool `oracle_*`) |
|---|---|
| Ghost danger zone | "Something falls there." · "Not there — soon." |
| Seer's eye on an ally | "{name}, it comes for you." · "{name} — move." |
| Ward | "You're covered." · "I saw this." |
| Omen gained | "As foretold." |
| Foretold Doom | "Its end is written. Strike." |
| Guiding Call | "Come, {name}. Follow the thread." |
| Crit heal | "It was always going to be all right." |
| Low health | "I didn't see this one…" · "My thread is thin." |
| Unwritten Hour | "Not today. I've **read** today." |

---

## 11. Reuse notes

| Borrowed | From | How |
|---|---|---|
| Shields | Farhold talent `bulwark`/`aegis` (`barrier` in `js/skilltalents.js`), `STATUS_FX.barrier` | Foretold Ward |
| Focus | Farhold `js/foci.js` `seer_orb` (Mote) | starter off-hand, `uq_farsight_lens` |
| Visuals | `spellfx.js` `arcane` (gold-recoloured), `holy`, `pillar`, `heal()` | every spell, Guiding Call |
| Outfit | `class-outfits.json` `oracle` (hood, trim_robe, prayer_ribbons); Farhold look eyes `glow_tear` | as is |
| Emberveil 2 prototype ideas | `foresight` → Foretold Ward, `prophecy` → Circle of Prophecy, `fate_weave` → Thread-Cut, `ascendance` → Unwritten Hour | ideas only |
| Not used | Farhold oracle skills `arcane_burst`, `guard_stance`, `renew`, `curse`, `quicken`, `meteor`; Farhold pet `ember_familiar` (round 1 already dropped it) | replaced |
| New | ghost telegraph renderer (a second, dashed draw of page 11's telegraph shapes at a lead time), intent glyphs, Next line, seer's eye, early-send of telegraph data per client (page 16), Omen gauge, Foretold Doom, Guiding Call (a server-side accept-and-move with discovery credit, page 20) | (new) |
