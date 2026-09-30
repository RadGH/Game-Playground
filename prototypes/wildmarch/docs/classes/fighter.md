# Fighter — class design (`fighter`)

> *"Every fight has three answers. I only have to pick the right one first."*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Follows the class template in [page 00 §5](../00-OVERVIEW.md).
Canon facts used (page 00 §6): primary role **Damage**, hybrid role **Tank**, build **melee**, **heavy** armour,
resource **Momentum**, mechanic **Stances — Offense / Defense / Precision change what each of the six spells does**,
spell slots **1 / 4 / 10 / 18 / 28 / 40**, calling quests **6 / 20 / 40**, talent tiers **12 / 22 / 32 / 45**, cap **60**.

## How to read the numbers on this page

- **% WD** = percent of one weapon hit (page 05 owns the formula). The number here is **final**: Farhold's
  `effectiveMult` (unlock level + cooldown bonus, `js/skills.js`) is already folded in; nothing multiplies it again.
- **Momentum**: pool **100**, starts **empty** each fight, builds from basic hits and hits taken (page 05
  owns the base gain), drains **10 a second** after 5 s out of combat. The fighter's own sources: Measured
  Cut **+12**, a successful Answering Blade parry **+20**, Offense stance **+20%** to all Momentum gained,
  Precision stance **−20%**. Spenders: Closing Step 15, Plate Splitter 25, Duellist's Decree 35,
  Threefold Form 50.
- **Targeting** (page 02, 00 §12.1 W8): **Needs target** = will not cast without a valid hard target;
  **Auto-target** = with no valid target it picks the valid enemy closest to your aim point in range;
  **Self**; **Ally** (a party member or yourself, `F1`–`F5`); **Ground**.
- **Tags** (page 05 §Tags owns the list): every spell lists its tags; a bonus to a tag applies to every
  spell carrying it (a "+10% Melee Attack damage" affix needs both `tag_melee` and `tag_attack`).
- Statuses (bleed, stun, knockdown, root, taunt, weaken, disarm, stagger, marked) are page 05's list.
  Bosses are immune to stun, knockdown and disarm; where a rider would do that to a boss, the boss version
  is written next to it.
- **Rider** = the extra effect a spell gains from the stance you are in when you cast it.

---

## 1. Identity

| Field | Value |
|---|---|
| Fantasy | The drilled professional. Not the strongest person on the field — the one who read it first. |
| Primary role | **Damage** (Offense or Precision stance). |
| Hybrid role | **Tank** — Defense stance with a shield (§5). |
| Build | melee |
| Armour | heavy |
| Weapons | one-handed sword, one-handed hammer, two-handed sword; shield optional (reuse: `prototypes/farhold/js/weapons.js` `sword`, `longsword`, `hammer`, `sword2h`, `greatsword`) |
| Primary attribute | STR (secondary DEX) |
| Resource | **Momentum** (0–100) + the **stance dial** |
| Companion | none |
| Starting kit | two-handed sword, medium chest, heavy helm, heavy gauntlets (reuse: Farhold `classes.json` `fighter`) |

**Playstyle in three sentences.** Every fighter spell has **three versions**, one per stance, and the
fighter swaps stance freely (1.5 s cooldown, no cost) to pick the version the moment needs. A parry
(**Answering Blade**) is the class's heartbeat: read the enemy's swing, cancel it, hit back. The skill
ceiling is the swap — at level 20 the first spell after a swap carries *both* stances' riders, so good
fighters dance between stances every few seconds.

**Original hook:** "Riposte counters parries. Tactical stances swap between offense and defense. Precise
Strike never misses." — kept as Answering Blade, the stance dial and the Precision stance.

---

## 2. Class mechanic — Stances (new)

### 2.1 The three stances

| Stance | Unlock | Always-on while in it | Colour |
|---|---|---|---|
| **Offense** | level 1 | +15% damage dealt, +10% damage taken, +20% Momentum gained | flame red |
| **Defense** | level 1 | −20% damage taken, threat ×1.5, −10% damage dealt, +10% block chance with a shield | steel blue |
| **Precision** | calling 6 | your hits cannot be dodged, parried or blocked; +10% critical chance; +20% critical damage; −20% Momentum gained | white-gold |

- Swap: instant, **1.5 s cooldown**, no Momentum cost, works while casting nothing, does not trigger the
  global cooldown. Keys: **`Shift+1` Offense, `Shift+2` Defense, `Shift+3` Precision** (page 00 §10: `Shift+1`–`4` are the
  form/stance keys; page 02 owns them) plus "cycle stance" on the gamepad's left bumper.
- You are always in exactly one stance. Your stance is saved with the character and restored on login.
- Every spell (§3) lists three **riders**; only the current stance's rider fires.
- A stance never changes a spell's targeting kind or its tags; only a talent that says so does.

### 2.2 Calling quests (page 14 owns the text)

| Level | Quest id | Where | Grants |
|---|---|---|---|
| 6 | `q_calling_fighter_1` "The Third Answer" | Brightwater drill yard, Hearthvale — a retired sergeant duels you three times, each won in a different way | **Precision** stance |
| 20 | `q_calling_fighter_2` "Dance of the Drillmaster" | Highcourt, the Crown Assembly's fencing hall | **Stance Dance**: for **3 s** after a swap, your next spell carries the riders of **both** the stance you left and the one you entered |
| 40 | `q_calling_fighter_3` "The Threefold Form" | Rimehold, Frostmantle — a duel on a frozen lake | **Threefold Form**: hold any stance key 1 s (costs **50 Momentum**) — for **10 s** you get the good half of all three stances (+15% damage, −20% damage taken, cannot be dodged/parried, +10% crit) and every spell carries **all three riders**. Cooldown **120 s** |

### 2.3 Gauge and HUD (new; page 03 `hud_stance_dial`)

- A small **triangle dial** left of the Momentum bar with one corner per stance. The current corner glows in
  its colour; a locked stance (Precision before level 6) is shown dark with a padlock.
- Swap cooldown: a thin ring around the triangle draining over 1.5 s.
- **Stance Dance** window: the corner you just left keeps a fading glow for 3 s; the next spell icon gets
  a two-colour border.
- **Threefold Form**: all three corners lit, a 10 s white ring timer; the whole spell bar gets a gold frame.
- Every spell icon on the bar shows a **coloured corner tab** for the rider that will fire now.
  The spell tooltip lists all three riders with the active one highlighted (reuse `shared/tooltip.js`,
  `data-tip-render`).
- The character model changes guard pose per stance (Chibi 2 `ready` for Offense, `guard` for Defense, a
  raised-point pose built from `thrust`'s first frame for Precision) and the weapon gets a faint
  stance-coloured trail.

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Target | Shape | Tags | Headline |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `fighter_measured_cut` | Measured Cut | builds 12 Momentum | 4 s | instant | Auto-target | 3.2 m cone, 60° | `tag_physical` `tag_attack` `tag_melee` `tag_area` | 150% WD + rider |
| 2 | 4 | `fighter_answering_blade` | Answering Blade | 0 (parry builds 20) | 8 s | 0.8 s parry window | Self | self → attacker | `tag_physical` `tag_attack` `tag_melee` | cancel a hit, counter 220% WD |
| 3 | 10 | `fighter_closing_step` | Closing Step | 15 Momentum | 12 s | instant | Auto-target | dash to target, 10 m | `tag_physical` `tag_attack` `tag_melee` `tag_movement` | 110% WD + rider |
| 4 | 18 | `fighter_plate_splitter` | Plate Splitter | 25 Momentum | 10 s | instant | Needs target | melee single, 3 m | `tag_physical` `tag_attack` `tag_melee` `tag_duration` | 180% WD, armour −8%/stack |
| 5 | 28 | `fighter_veterans_breath` | Veteran's Breath | 0 | 90 s | instant | Self | self | `tag_heal` `tag_duration` | heal 25% over 4 s; Defense: the big defensive |
| 6 | 40 | `fighter_duellists_decree` | Duellist's Decree | 35 Momentum | 60 s | instant | Needs target | one enemy, 20 m | `tag_duration` | 12 s duel: +20% damage to it + rider |

### 3.2 Spell details (each with its three riders)

**1. `fighter_measured_cut` — Measured Cut** (level 1)
- Builds **12 Momentum**. Cooldown **4 s**. Instant. Melee cone **3.2 m, 60°**. **150% WD** physical.
- Targeting: **Auto-target** — faces your hard target if you have one in reach; otherwise turns to the
  enemy nearest your aim point within 3.2 m; with nothing in reach it swings the cone where you face.
- Tags: `tag_physical` `tag_attack` `tag_melee` `tag_area`.
- Riders — **Offense:** bleed 6 s (page 05). **Defense:** you gain **Guarded** (15% less damage) for 4 s
  and threat ×3 on this hit. **Precision:** cannot miss, **+25% critical chance** on this hit.
- Looks: Chibi 2 `slash` (sword) or `overhead` (two-hander); a stance-coloured `slash` sprite along the
  blade path; spellfx `impact` element `physical` (Offense adds `bleed` drops).
- Sound: `melee.swing` + `melee.hit` (`melee.crit` on crit).

**2. `fighter_answering_blade` — Answering Blade** (level 4)
- Cost **0**; a successful parry **builds 20 Momentum**. Cooldown **8 s**. Opens a **0.8 s parry window**.
- Targeting: **Self** — no target needed; the counter goes to whoever attacked you.
- Tags: `tag_physical` `tag_attack` `tag_melee` (the counter hit).
- If a **melee** hit reaches you in the window: the hit is **cancelled** (0 damage) and you counter the
  attacker for **220% WD**. If nothing arrives, the cooldown is refunded to 4 s.
- Riders — **Offense:** the counter hits a **3 m circle** around you. **Defense:** window **1.5 s**, and it
  also parries **projectiles and single-target spells** (not ground effects). **Precision:** the counter
  always crits and **disarms** 3 s (boss: its next basic attack is delayed 1 s).
- Boss tank busters: a **melee** tank buster can be parried (page 11 marks unparryable ones with a crossed
  sword on the cast bar).
- Looks: Chibi 2 `parry`, then `slashBack` for the counter; a blue-white `deflect` status ring (spellfx
  `STATUS_FX.deflect`) during the window; a spark burst on a successful parry, hit-stop 110 ms.
- Sound: `status.deflect.apply` on open, `melee.block` + `melee.crit` on a parry.

**3. `fighter_closing_step` — Closing Step** (level 10)
- Cost **15 Momentum**. Cooldown **12 s**. Instant **dash to an enemy up to 10 m** away; **110% WD** on arrival.
- Targeting: **Auto-target** — your hard target if it is within 10 m, otherwise the enemy nearest your aim
  point within 10 m (it does not change your hard target). No enemy in range: the spell does not fire.
- Tags: `tag_physical` `tag_attack` `tag_melee` `tag_movement`.
- Riders — **Offense:** **knockdown 1 s** (boss: none). **Defense:** **taunt 3 s**, threat ×5.
  **Precision:** your next spell within 4 s is a guaranteed critical hit.
- Also a movement tool: the dash is 0.25 s and carries you through a danger zone's edge (no immunity
  without the tier-4 talent).
- Looks: Chibi 2 `lunge`; `streak` sprites behind you, dust `footprint` decals.
- Sound: `travel.step` ×3 fast, `melee.hit`.

**4. `fighter_plate_splitter` — Plate Splitter** (level 18)
- Cost **25 Momentum**. Cooldown **10 s**. Instant melee, single target, **3 m**. **180% WD**.
- Targeting: **Needs target** — stacks belong on one chosen enemy, so it never picks one for you.
- Tags: `tag_physical` `tag_attack` `tag_melee` `tag_duration` (Split Plate).
- Applies **Split Plate**: −8% armour per stack, max **3 stacks**, 12 s (page 05 `sunder`).
- Riders — **Offense:** also hits up to 2 enemies within 2 m of the target, each getting a stack.
  **Defense:** target is **weakened** (deals 20% less) for 8 s. **Precision:** this hit **ignores all
  armour** and **marks** the target (takes 10% more from everyone) for 8 s.
- Looks: Chibi 2 `smash` (hammer) or `chop`; spellfx `crack` sprite stuck on the target (`STATUS_FX.sunder`)
  one crack per stack.
- Sound: `melee.hit` + `status.sunder.apply`.

**5. `fighter_veterans_breath` — Veteran's Breath** (level 28) — **the big defensive cooldown in Defense**
- Cost **0**. Cooldown **90 s**. Instant, self.
- Targeting: **Self**. Tags: `tag_heal` `tag_duration` (Defense rider adds `tag_shield`).
- Heals **25% max health over 4 s** and removes one snare, root or slow.
- Riders — **Offense:** your next 3 hits deal **+30%**. **Defense:** **40% less damage taken for 8 s** and
  a barrier of **20% max health** for 8 s. **Precision:** resets the cooldowns of Answering Blade and
  Closing Step.
- Looks: Chibi 2 `stretch` blended into `ready` (0.4 s); a rising ring of `puff` sprites; Defense adds
  `STATUS_FX.barrier`.
- Sound: a long exhale (voice), `status.regen.apply`, Defense adds `status.barrier.apply`.

**6. `fighter_duellists_decree` — Duellist's Decree** (level 40)
- Cost **35 Momentum**. Cooldown **60 s** (halved if the target dies during the decree). Instant, one enemy
  within **20 m**. Lasts **12 s**.
- Targeting: **Needs target** — the duel is always with the enemy you chose.
- Tags: `tag_duration` (the damage it boosts carries the tags of whatever hits the target).
- Base: you deal **+20% damage** to the duel target. A white chalk ring (4 m) draws under it.
- Riders — **Offense:** **+40%** instead of 20%, but you take **+10%** from that target.
  **Defense:** the target is **taunted** for the whole duel and deals **30% less damage to everyone**.
  **Precision:** every **3rd** hit you land on it strikes a second time for **100%** of that hit.
- Looks: a `rune_ring` decal under the target in the stance colour, a thin line from you to it (gold, not
  white — white is page 11's tether colour), a sword `target` sprite above it.
- Sound: `bell.toll` (short) + `status.marked.apply`.

### 3.3 Rotation / how it plays

- **Solo:** Offense stance. Closing Step in (knockdown), Measured Cut on cooldown for bleed, Plate
  Splitter to 3 stacks on the elite, Answering Blade whenever a big swing winds up. Swap to Defense for
  Veteran's Breath when low, back to Offense.
- **Dungeon (damage):** Precision on the boss (unparryable, crits, Plate Splitter ignores armour and marks it
  for the group), Offense on packs (Answering Blade becomes a 3 m circle). With Stance Dance (20+), the
  standard loop is: Offense Measured Cut → swap Precision → Plate Splitter (carries Offense's splash *and*
  Precision's armour ignore) → swap back when the swap cooldown is up.
- **Dungeon (tank):** Defense with a shield. Closing Step taunts, Answering Blade parries projectiles, Decree
  taunts the boss for 12 s and cuts its damage 30% for everyone — a group-wide defensive.
- **Challenge mode:** damage fighters play Precision on the boss (the mark helps the whole party) and line
  Threefold Form up with the boss's burn phase (page 11 phases).

### 3.4 Boss mechanics

| Mechanic (page 11) | Fighter |
|---|---|
| Melee tank buster | **Parry it** with Answering Blade (unless marked unparryable). |
| Projectile barrage / single-target bolts | Defense Answering Blade parries them for 1.5 s. |
| Soak (orange) | Defense stance −20% + Veteran's Breath Defense rider make a fighter a good second soaker. |
| Void zone / danger zone | Closing Step (onto an enemy outside it), dodge roll; tier-4 **Unseen Step** gives 0.4 s immunity. |
| Adds | Offense Answering Blade circle, Offense Plate Splitter splash, Defense Closing Step taunt. |
| Interrupt | None in the base kit. Tier-2 **Staggering Answer** delays a boss attack 0.4 s but does not interrupt. The fighter is not a kicker. |
| Tank swap | Defense Closing Step (taunt) or Defense Duellist's Decree (12 s taunt). |
| Knockback | No immunity; tier-2 **Unshaken** (Veteran's Breath) gives crowd-control immunity 4 s. |

---

## 4. Alternate spells

None. The fighter's bar never changes; the **riders** change instead. What each spell does is the base
line plus the rider of the current stance (plus the left stance's rider during Stance Dance, plus all three
in Threefold Form).

---

## 5. The hybrid role — Tank (Defense stance)

The fighter uses the shared **Role focus** switch in the spellbook (canon 00 §6; out of combat, saved per
Loadout), **tied to Defense stance and a shield**: **Hybrid** queues it as **Tank** in the Dungeon Finder and
needs a shield in the off hand (the switch greys out with the tooltip "Tank needs a shield in the off hand"
otherwise). What it changes lives in Defense stance: the Defense riders, the extra threat and the block
bonus below. **Primary** queues it as Damage; the stance dial works the same in either focus.

| Piece | How it tanks |
|---|---|
| Defense stance | −20% damage taken, threat ×1.5, +10% block chance with a shield |
| Closing Step (Defense) | taunt 3 s, threat ×5 — the pick-up tool, 12 s cooldown |
| Measured Cut (Defense) | Guarded (−15% damage taken 4 s) and threat ×3 — keep it on cooldown to keep Guarded up (4 s cooldown = 100% uptime) |
| Answering Blade (Defense) | 1.5 s window that also parries projectiles and single-target spells |
| Veteran's Breath (Defense) | the one big defensive: −40% for 8 s + a 20% barrier, 90 s |
| Duellist's Decree (Defense) | 12 s taunt on the boss, and it deals 30% less to everyone |
| Talents that help | Answering Blade t1c **Covering Guard**, t2a **Counter Chain**; Closing Step t1a **Guardian Step**; Plate Splitter t2b **Shared Split** (keeps the Defense weaken up on the boss); Veteran's Breath t2a **Unshaken**; Decree t2b **Pride** |
| Gear | shield + one-handed sword or hammer; armour/health affixes; a gem in the shield for block chance (page 08 gem table, armour column) |

**How good it is.** Compared with the warrior (the primary tank), a Defense fighter takes about **15% more
damage** from steady boss melee (−20% flat against the warrior's block charges, which cut qualifying hits
by 70%) and has **one** big defensive on a 90 s cooldown against the warrior's two. It has **no interrupt**
and only one area taunt option (Decree t4b). That is plenty for the **open world, Normal dungeons and Depth up
to about 10**, where packs are small and tank busters are well spaced. In **Challenge mode** back-to-back
tank busters and the interrupt checks outrun it: a Challenge party with a fighter tank needs another
interrupter and should expect the healer to work harder.

---

## 6. Utility spells

None. The fighter has no travel or ritual spells; it uses scrolls and the Recall Stone (page 20).

---

## 7. Talents

Id = spell id + `_t<tier><letter>` (e.g. `fighter_measured_cut_t2b`). A tier opens at its level or when
the spell unlocks, whichever is later. Talents that name a stance only change that stance's rider.

### Measured Cut
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Cross Cut** — two cuts in an X, 90° cone, 2 × 80% WD; the rider fires on both. | **Long Cut** — becomes a 6 m × 1.5 m thrust line that passes through everything. | **Advancing Cut** — you step 3 m forward before cutting. |
| 2 (22) | **Tempo** — every 3rd Measured Cut in a row within 10 s has no cooldown and fires its rider twice. | **Leaving Cut** — the first Measured Cut after any swap also carries the rider of the stance you left (Stance Dance before level 20, for this spell only). | **Opening Cut** — if the target is attacking someone else, it is staggered 0.6 s. |
| 3 (32) | **Shearing** — each cut adds 1 Split Plate stack. | **Cut and Cover** — the cut also opens a 1 s parry window that counters at 100% WD. | **All In** — pay 20 Momentum to fire all three riders at once. |
| 4 (45) | **Drill** — hold the key: 4 cuts over 1.6 s, rider on each. | **Wind Cut** — the cut sends a 10 m slash wave (60% WD) forward. | — |

### Answering Blade
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Long Guard** — window 1.5 s in every stance (Defense 2.2 s). | **Step Aside** — on a parry you slip 3 m behind the attacker before countering. | **Covering Guard** — the window also covers one ally within 3 m; the first hit on them is cancelled and countered. |
| 2 (22) | **Counter Chain** — each parry keeps the window open 0.5 s more (parry several hits). | **Return to Sender** — parried projectiles fly back at the shooter for 150% of their damage (the return adds `tag_ranged` `tag_projectile`). | **Staggering Answer** — the counter staggers 1.5 s (boss: delays its next attack 0.4 s). |
| 3 (32) | **Cold Read** — a parry resets Closing Step. | **Blade Wall** — a window with no parry gives 10% less damage for 4 s and the full cooldown back. | **Riposte Flurry** — the counter is 3 hits of 90% WD. |
| 4 (45) | **Perfect Answer** — a parry in the first 0.2 s of the window counters for 400% WD and gives 30 Momentum. | **Circle of Steel** — the window covers every ally within 5 m (one parry each). | — |

### Closing Step
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Guardian Step** — may target an ally (targeting becomes **Needs target**, enemy or Ally): you dash to them and take the next hit aimed at them. | **Double Step** — 2 charges. | **Passing Step** — you dash 6 m *through* the target, hitting everything on the path. |
| 2 (22) | **Pin** — the target is rooted 2 s (boss: slowed 20%). | **Step Back** — press again within 2 s to return to where you started. | **Shield Step** — the dash gives a barrier of 10% max health for 5 s. |
| 3 (32) | **Reel In** — instead of you dashing, the target is pulled 4 m to you. | **Pressing Step** — each hit you take in the next 3 s cuts the cooldown 1 s. | **Landing Sweep** — on arrival, an 80% WD sweep in a 4 m circle. |
| 4 (45) | **Unseen Step** — immune to damage for the 0.4 s of the dash. | **Chain Step** — a kill within 4 s resets it. | — |

### Plate Splitter
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Wide Splitter** — 120° cone, 3.5 m. | **Deep Split** — up to 5 stacks. | **Hammered** — knocks the target back 4 m; whatever it hits also gets a stack. |
| 2 (22) | **Rusting Split** — each stack also bleeds 10% WD a second. | **Shared Split** — allies' hits on a 3-stack target refresh the stacks. | **Guard Break** — reaching 3 stacks stuns 1.5 s (boss: **Guard Broken**, takes 15% more for 4 s). |
| 3 (32) | **Carve** — on a target at max stacks it spends them for +60% WD per stack. | **Weak Point** — leaves a glowing mark: the next hit from any ally is a critical. | **Shield Splitter** — also strips one barrier or shield effect from the target. |
| 4 (45) | **Splitting Wave** — the hit travels on as a 12 m line, stacking everything in it. | **Twin Split** — hits twice; the second hit is 70%. | — |

### Veteran's Breath
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Second Breath** — 2 charges. | **Deep Breath** — the heal lands instantly. | **Rallying Breath** — allies within 10 m heal for half as much. |
| 2 (22)\* | **Unshaken** — immune to stun, fear, root and knockback for 4 s. | **Grit** — each hit taken while it heals adds 0.5 s. | **Hot Blood** — gives 40 Momentum, the heal is halved. |
| 3 (32) | **Reset the Feet** — resets the stance swap cooldown and starts a Stance Dance window. | **Back to the Wall** — used under 30% health, the heal is doubled. | **Clear Head** — removes every debuff on you. |
| 4 (45) | **Iron Lungs** — for 8 s you cannot drop below 1 health; cooldown +30 s. | **Warmaster's Breath** — allies within 15 m get your current stance's rider too. | — |

\* unlocks at 28: tiers 1–2 open together.

### Duellist's Decree
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Open Duel** — two duel targets at once. | **Ring of Honour** — the chalk ring widens to 12 m; the target cannot leave it (boss: no effect). | **Called Shot** — the decree opens with a 200% WD strike. |
| 2 (22)\* | **Blood Oath** — heal 3% of the damage you deal to the duel target. | **Pride** — nobody else can taunt your duel target (lock a boss to you). | **Crowd Pleaser** — allies deal +10% to your duel target. |
| 3 (32)\* | **Winner Takes All** — on a kill, the decree jumps to the nearest enemy with its remaining time. | **Duel's End** — when it ends, a finisher hits for 20% of all damage you dealt it during the duel. | **Changing Forms** — each stance swap during the duel adds 2 s (max 20 s). |
| 4 (45) | **Champion's Decree** — cooldown 45 s. | **Grand Decree** — every enemy within 8 m becomes a duel target at half the bonus. | — |

\* unlocks at 40: tiers 1–3 open together.

---

## 8. Class sets

### `set_fighter_three_answers` — The Three Answers (dungeon set)
`d09_warmasters_pit` boss 2 (head), `d10_rimefang_caverns` boss 2 (hands), `d11_saltdeep_cathedral`
boss 2 (feet), `d12_unmade_workshop` boss 2 (legs), `d13_cindergate` boss 3 (chest), `d14_ashen_reliquary`
boss 2 (necklace `it_three_answers_torc`). Drops on **Normal** at the dungeon's level (item level 31–60)
and on **Challenge** at item level 60; Depth runs of these dungeons can drop it too (page 12).
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Stance swap cooldown **0.5 s**. | the dial |
| 4 | Stance Dance lasts **5 s** and covers your next **two** spells. | every spell |
| 6 | A successful Answering Blade parry fires **all three** riders. | Answering Blade |

### `set_fighter_drillmaster` — Harness of the Drillmaster (endgame set)
Item level 60. Drops from **Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per
boss; page 12 names which boss drops which piece) and from the **end chest of any dungeon at Depth 10 or
deeper** (one random piece, 8% chance). *(Was a raid set; raids are in `WISHLIST.md`.)*
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Duellist's Decree cooldown **40 s**. | Duellist's Decree |
| 4 | Bringing the duel target to max Split Plate stacks refreshes the decree to 12 s (once per decree). | Plate Splitter, Decree |
| 6 | In Threefold Form, every parry also strikes your duel target for 150% WD wherever it is. | Threefold Form, Answering Blade |

---

## 9. Class legendaries, uniques and souls

### Legendaries
| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_the_drillmasters_word` | The Drillmaster's Word | two-handed sword | **Fourth Answer** — swapping to the stance you are already in (double-tap) fires the current stance's rider on your next *basic* attack, every 6 s. | a Challenge-mode `d15_fire_court` boss (page 12 names which) |
| `leg_counterweight` | Counterweight | one-handed hammer | **Answer in Kind** — Answering Blade's counter deals damage equal to 300% of the parried hit (if larger than 220% WD). | `d10_rimefang_caverns` final boss on Challenge, and its Depth end chest |
| `leg_honours_edge` | Honour's Edge | one-handed sword | **Unending Duel** — Duellist's Decree has no duration while the target is alive; it ends when it dies or you swap stance twice. | the end chest of any dungeon at **Depth 15+** (1.5%) |
| `leg_bracers_of_the_dial` | Bracers of the Dial | heavy hands | **Turning Wheel** — every stance swap gives 8 Momentum and resets Measured Cut. | the world boss of `frostmantle` (page 13) |

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_splitmark_gauntlets` | Splitmark Gauntlets | heavy hands | Plate Splitter stacks last 20 s. | `d04_bellows_keep` boss 2 |
| `uq_sergeants_whistle` | Sergeant's Whistle | necklace | Closing Step has 2 charges; the second costs no Momentum. | `d02_drowned_mill` final boss (Normal at its level; Challenge and Depth at 60) |
| `uq_breathing_plate` | Breathing Plate | heavy chest | Veteran's Breath also removes one stun or fear, and can be used while stunned. | `d07_thornheart` final boss |

### Souls
A soul goes in a Soul socket (page 08) and adds a behaviour. Both need the wearer to be a **fighter**.

| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_open_guard` | Soul of the Open Guard | armour — chest | class: fighter | While in **Defense**, the first melee hit you take every **6 s** is parried automatically as if Answering Blade's window were open (counter **150% WD**, the Defense rider applies). Does not start Answering Blade's cooldown. | `d09_warmasters_pit` final boss on Challenge (3%); world boss of `cinder_steppe` (page 13, 2%) |
| `soul_drill_sergeant` | Soul of the Drill Sergeant | weapon | class: fighter | **Measured Cut leaves a chalk mark** on the ground for 4 s. Swapping stance while standing in it detonates it: **120% WD** in a 3 m circle carrying the **new** stance's rider (`tag_physical` `tag_attack` `tag_melee` `tag_area`). | end chest at **Depth 15+** (1%); world boss of `frostmantle` (page 13, 2%) |

---

## 10. Voice and barks

- Timbre: `shared/voices.js` role `fighter` (pitch 0.38, depth 0.70, rough 0.20 — clipped, steady).
- Lingo tag `class:fighter`; lines are terse and procedural.

| Moment | Lines |
|---|---|
| Swap to Offense | "Pressing." · "Now we go." |
| Swap to Defense | "Hold." · "Shields." |
| Swap to Precision | "Measure twice." · "There's the gap." |
| Answering Blade parry | "Answered." · "Too slow." · "Read it." |
| Closing Step | "Closing." |
| Duellist's Decree | "You and me." · "Step into the ring." |
| Threefold Form | "Every answer at once." |
| Critical hit | "Clean." |
| Low health | "Need a breath—" · "Falling back a step!" |
| Kill | "Next." |

---

## 11. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Timbre `fighter` | `shared/voices.js` | voice |
| Look (horned helm, plate, red cape, `fh_greatsword`) | `avatar-3d/data/class-outfits.json` `classes.fighter` | default outfit |
| Clips `slash`, `overhead`, `parry`, `slashBack`, `lunge`, `smash`, `chop`, `guard`, `ready`, `stretch` | `avatar-3d/js/chibi2-motion.js` | spells and stance poses |
| Visual ideas of Farhold `power_strike`, `sunder`, `charge`, `guard_stance` | `prototypes/farhold/data/skills.json` | effects only — ids/names/numbers new |
| `deflect`, `barrier`, `sunder`, `marked` auras | `avatar-3d/js/spellfx.js` `STATUS_FX` | parry window, Defense rider, Split Plate, Precision mark |
| Weapon `guard` trait (block chance) | `prototypes/farhold/js/weapons.js` `WEAPON_TRAITS` | Defense stance block |
| Hit-stop on parry | `prototypes/farhold/js/combat-feel.js` | Answering Blade |
| Emberveil 2 prototype skills `precise_strike`, `defensive_stance`, `offensive_stance`, `riposte`, `second_wind`, `sunder_armor` | `prototypes/emberveil/data/skills.json` | design ancestry of this kit |
| Sound ids | `sfx/data/catalog.json` | as listed per spell |
| Talent engine | `prototypes/farhold/js/skilltalents.js`; new mod keys `rider`, `parry`, `stanceDance` | talent cards |
