# Warrior — class design (`warrior`)

> *"Come on, then. All of you. I have room."*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Follows the class template in
[page 00 §5](../00-OVERVIEW.md). Canon facts used here (from page 00 §6): primary role **Tank**, hybrid role
**Damage**, build **melee**, **heavy** armour, resource **Momentum**, mechanic **Bulwark**, spell slots at
**1 / 4 / 10 / 18 / 28 / 40**, calling quests at **6 / 20 / 40**, talent tiers at **12 / 22 / 32 / 45**, level cap **60**.

## How to read the numbers on this page

- **% WD** = percent of one weapon hit (the weapon's rolled damage before armour; page 05 owns the formula).
  The coefficient written here is the **final** one. Farhold multiplied every skill by `effectiveMult`
  (a bonus for unlock level and cooldown, `js/skills.js`); in Wildmarch that bonus is **already folded in**
  to the number on this page, so nothing multiplies it a second time (one multiplier, one owner).
- **Momentum**: a pool of **100** that starts empty. Page 05 owns the base gain (basic hits and hits taken)
  and the drain (10 per second after 5 s out of combat). The numbers here are only what warrior spells add
  or spend. What the warrior builds and spends is summed up in §1.1.
- **Threat ×N** = the hit makes N times its damage in threat (page 05 §13 owns threat).
- **Targeting** (page 00 §12.1 W8, page 02): **Needs target** will not cast without a valid hard target;
  **Auto-target** casts on your hard target, or if you have none, on the valid enemy nearest your aim point
  in range; **Ground** is placed at the aim point; **Self** is centred on you; **Ally** needs a friendly target
  (`F1` yourself, `F2`–`F5` party).
- **Tags** are page 05 §Tags ids. A bonus to a tag (for example "+10% Area damage") applies to any spell
  carrying it.
- Statuses (stun, bleed, snare, sunder, taunt, silence, weaken…) are page 05's list; durations here are
  the warrior's own. A boss is **immune to stun**; a warrior stun on a boss fills its **break bar** and
  interrupts only (page 05 §11.4).

---

## 1. Identity

| Field | Value |
|---|---|
| Fantasy | The one who stands in the doorway. A soldier who gets *stronger* the more things are hitting them. |
| Primary role | **Tank** — shield in the off hand. |
| Hybrid role | **Damage** — a two-handed weapon, the same six spells played for their hits instead of their blocks (§5). |
| Build | **melee** |
| Armour | heavy |
| Weapons | one-handed sword, one-handed hammer, two-handed sword, two-handed axe. Shield in the off hand (reuse: `prototypes/farhold/js/weapons.js` `WEAPON_PATTERNS`: `sword`, `longsword`, `hammer`, `sword2h`, `axe2h`) |
| Primary attribute | STR (secondary CON) |
| Resource | **Momentum** (0–100) + the **Bulwark** block-charge row |
| Companion | none |
| Starting kit | longsword + heater shield, heavy chest, heavy helm, heavy gauntlets (reuse: Farhold `data/classes.json` `warrior.startingArmour`) |

**Playstyle in three sentences.** The warrior banks **block charges** by bashing things, then spends
them either by *getting hit* (each charge soaks most of one blow) or by *hitting very hard* (Faultline eats
every charge for extra damage). When three or more enemies are on them they become **Unbreakable** and
the charges refill on their own. The class is at its best in the middle of a pack, and its hardest decision
is always "do I keep these charges for the boss's next big swing, or cash them in now?"

### 1.1 Momentum — what the warrior builds and spends

| Source | Momentum |
|---|---|
| Page 05 base: each basic hit that connects / each hit taken | (page 05's numbers) |
| Bulwark Bash | **+15** |
| A block charge spent while holding a two-hander | **+10** |
| Returned Blow (calling 2) — each charge spent, any weapon | **+8** |
| Iron Gale, each hit that lands on 3+ enemies | **+3** |
| Unbroken Stand, each hit taken while it lasts | **+5** |
| **Spends:** Iron Call 10 · Hurled Bulwark 20 · Iron Gale 30 · Faultline 40 · Unbroken Stand 0 | |

A tank warrior sits around 40–70 Momentum in a pack fight and 20–40 on a lone boss (fewer hits taken). A
two-hander warrior gains about 30% more because every spent charge refunds 10.

**Original hook (the Farhold / `prototypes/emberveil/` warrior):** "Shield Bash stuns enemies. Whirlwind hits
all adjacent foes. Unbreakable when outnumbered." — kept as Bulwark Bash, Iron Gale and the Unbreakable passive.

---

## 2. Class mechanic — Bulwark (new)

### 2.1 Block charges

| Rule | Value |
|---|---|
| Starting cap | **2** charges (level 1) |
| Gained from | Bulwark Bash (+2), Iron Call (+1 per enemy taunted, max 3), Hurled Bulwark (+1 per hit, max 2), Unbreakable (+1 every 4 s) |
| What a charge does (shield held) | The next hit that deals **3% or more of your max health** is reduced by **70%**. One charge per hit. Hits smaller than 3% never use a charge, so trash chip damage cannot strip your row. |
| What a charge does (two-hander) | The same hit is reduced by **40%** and the charge refunds **+10 Momentum** when it is spent. |
| Direction | Any direction — a charge is not a frontal block. (A frontal *shield* block chance from the weapon's `guard` trait still exists on top; page 05 §3.5.) |
| Lifetime | Charges last **20 s** after the last one was gained, then all drop at once. |
| Out of combat | Charges drain 1 per 2 s. |
| Can a boss attack be charged? | Yes, if it is a normal hit. Page 11 "unblockable" attacks (marked with a cracked-shield icon on the cast bar) ignore charges. |

### 2.2 Unbreakable (unlocked by the level 6 calling)

While **3 or more enemies within 8 m are in combat with you**:

- You take **5% less damage for each enemy beyond 2** (4 enemies = 10%, max **25%** at 7).
- You cannot be knocked back, pulled or staggered (page 05's `stagger`/`push`, reuse `js/combat-feel.js`).
- You gain **1 block charge every 4 s**, with no other source.
- A **boss counts as 3 enemies**, so a warrior tanking a boss alone is Unbreakable at the 5% step. A
  champion or rare monster (page 10) counts as 2.

### 2.3 HUD (new; add to page 03 as `scr_hud` element `hud_bulwark`)

- A row of **shield pips** sits directly left of the Momentum bar, one pip per cap slot (2 → 5).
- Filled pip: steel grey with a gold rim. Empty pip: dark outline. A pip **cracks** (sprite `crack`, 0.3 s)
  when a charge is spent, and a small number pops over the player: `-70%`.
- A thin timer under the row shows the 20 s lifetime; it flashes for the last 3 s.
- **Unbreakable**: the whole row gets a red-iron border and an enemy count `×4` at its right end.
- **Last Rampart** (level 40): a gold "RAMPART" banner at the centre of the screen for 1 s, the
  pips shatter outward, and the cooldown shows as a grey clock over the row until it is back.
- Tooltip (`data-tip`, reuse `shared/tooltip.js`): "2 of 3 block charges. Each one cuts one hit of 3% or
  more of your health by 70%. They fall off 20 s after the last one you gained."

### 2.4 Calling quests (page 14 owns the quest text; these are the rewards)

| Level | Quest id | Where (page 01 owns) | Grants |
|---|---|---|---|
| 6 | `q_calling_warrior_1` "The Shieldwall at the Ford" | Brightwater, Hearthvale — hold a river ford with the Wardens' Vale watch against three waves | **Unbreakable** (§2.2) and the cap rises to **3** |
| 20 | `q_calling_warrior_2` "The Anvil's Answer" | Anvilgate, Greyridge — a Deepforge smith tests you by striking your shield | Cap **4**. **Returned Blow**: every spent charge hits the attacker for **40% of the damage it prevented** (physical, cannot crit) and gives **+8 Momentum** |
| 40 | `q_calling_warrior_3` "The Last Rampart" | Rimehold, Frostmantle — hold a broken gate through a siege with the Wardens' Rime watch | Cap **5**. **Last Rampart**: a hit that would kill you while you hold ≥1 charge leaves you at 1 health, spends every charge, makes you immune to damage for **0.75 s per charge** and heals **6% max health per charge**. Once per **180 s** |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Target | Shape | Tags | Headline |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `warrior_bulwark_bash` | Bulwark Bash | +15 Momentum (builds) | 8 s | instant | Auto-target | 3 m cone, 100° | `tag_physical` `tag_attack` `tag_melee` `tag_area` | 120% WD, stun 1.2 s, **+2 charges**, interrupts |
| 2 | 4 | `warrior_iron_call` | Iron Call | 10 Momentum | 10 s | instant | Self | 10 m circle on self | `tag_physical` `tag_area` `tag_duration` | taunt all 4 s, +1 charge per enemy |
| 3 | 10 | `warrior_iron_gale` | Iron Gale | 30 Momentum | 10 s | channel 1.5 s | Self | 5 m circle on self | `tag_physical` `tag_attack` `tag_melee` `tag_area` `tag_channel` | 5 × 48% WD, bleed |
| 4 | 18 | `warrior_hurled_bulwark` | Hurled Bulwark | 20 Momentum | 9 s | instant | Auto-target | thrown, 25 m, 3 bounces | `tag_physical` `tag_attack` `tag_ranged` `tag_projectile` | 90% WD each, threat ×4, snare |
| 5 | 28 | `warrior_unbroken_stand` | Unbroken Stand | 0 | 150 s | instant | Self | self | `tag_physical` `tag_duration` | 45% less damage 10 s, charges not spent |
| 6 | 40 | `warrior_faultline` | Faultline | 40 Momentum | 20 s | 0.6 s wind-up | Auto-target (aims the line at the target) | 16 × 3 m line | `tag_physical` `tag_attack` `tag_melee` `tag_area` | 250% WD + 40% per charge spent, sunder |

### 3.2 Spell details

**1. `warrior_bulwark_bash` — Bulwark Bash** (level 1)
- Cost: none; **builds 15 Momentum**. Cooldown **8 s**. Instant. Melee cone **3.0 m, 100°** in front.
- Targeting: **Auto-target** — turns you to face your hard target if it is within 3 m; with no target it
  faces the enemy nearest your aim point within 3 m; with nothing in reach it still fires (see Mechanic).
- Tags: `tag_physical`, `tag_attack`, `tag_melee`, `tag_area`.
- Damage: **120% WD** physical to everything in the cone. Threat ×3.
- Status: **stun 1.2 s** (non-boss). On a boss or stun-immune enemy: **interrupts** a gold-bordered cast
  (page 11) and locks that spell for 3 s.
- Mechanic: **+2 block charges** (even if nothing is hit — you can bash the air to pre-charge before a pull,
  which is intentional).
- With a two-hander: a pommel strike, same numbers, stun **0.8 s**.
- Looks: Chibi 2 clip `bash` (reuse: `avatar-3d/js/chibi2-motion.js` `CHIBI2_MELEE_ANIMS`); spellfx
  `impact` element `physical` with `crit: true` styling; `block` status aura flashes on the warrior 0.3 s.
- Sound: heavy iron clang + low body thud (sfx `melee.block` + `melee.hit`, reuse `sfx/data/catalog.json`).

**2. `warrior_iron_call` — Iron Call** (level 4)
- Cost **10 Momentum**. Cooldown **10 s**. Instant. Circle **10 m** centred on you.
- Targeting: **Self** (needs no target). The tier-1 talent **Called Out** turns it into **Needs target**.
- Tags: `tag_physical`, `tag_area`, `tag_duration`.
- Effect: **taunts** every enemy inside for **4 s** (they must attack you) and sets your threat on each to
  **110% of its current highest**. No damage.
- Mechanic: **+1 block charge per enemy taunted** (max +3).
- Looks: a ground ring expanding to 10 m (spellfx `ring`, element `physical`, colour steel), `rally`
  sprites (`arrow_up`) over the warrior, red `target` sprite over each taunted enemy for 1 s.
- Sound: short war shout (voice bark, §10) + a low gong (sfx `bell.toll` pitched down).

**3. `warrior_iron_gale` — Iron Gale** (level 10)
- Cost **30 Momentum**. Cooldown **10 s**. **Channel 1.5 s**; you may walk at 60% speed while spinning.
- Targeting: **Self**.
- Tags: `tag_physical`, `tag_attack`, `tag_melee`, `tag_area`, `tag_channel`.
- Shape: circle **5 m** on you. **5 hits × 48% WD** (240% total), one every 0.3 s.
- Momentum: each hit that lands on **3 or more** enemies returns **+3 Momentum**.
- Status: the 5th hit applies **bleed** (page 05, 6 s).
- Looks: Chibi 2 clip `whirl`; three steel slash arcs per turn (spellfx sprite `slash`), `spark` trail on
  the blade, dust ring at the feet.
- Sound: rising whoosh loop (`melee.swing` repeated, pitch rising), `melee.hit` per hit, `status.bleed.apply` on the last.

**4. `warrior_hurled_bulwark` — Hurled Bulwark** (level 18)
- Cost **20 Momentum**. Cooldown **9 s**. Instant throw, range **25 m**.
- Targeting: **Auto-target** — your hard target, or the enemy nearest your aim point within 25 m.
- Tags: `tag_physical`, `tag_attack`, `tag_ranged`, `tag_projectile`.
- Shape: hits the target, then **bounces** to the nearest enemy within 8 m, twice (3 hits total).
- Damage: **90% WD** per hit. Threat ×4 on each.
- Status: **snare 30% for 3 s** (page 05 "Snared").
- Mechanic: **+1 charge per hit, max +2**. While the shield is flying (1.2 s round trip) **you cannot spend
  charges** — the price of pulling with your block.
- With a two-hander: see **Hurled Edge** in §4.
- Looks: the actual off-hand model spins through the air (Chibi 2 `throw` clip; the shield mesh is detached
  from the forearm bone and returns), spellfx `projectile` shape `shards` recoloured steel, `physical` impact.
- Sound: whirring spin (`spell.physical.travel`), `melee.block` ring on each hit, `equip` clack when it returns.

**5. `warrior_unbroken_stand` — Unbroken Stand** (level 28) — **the big defensive cooldown**
- Cost **none**. Cooldown **150 s**. Instant, lasts **10 s**.
- Targeting: **Self**.
- Tags: `tag_physical`, `tag_duration`.
- Effect: take **45% less damage**. While you have ≥1 charge, every qualifying hit is reduced **as if a charge
  were spent, but the charge is not used**. Immune to knockback, pull, stagger. **+5 Momentum per hit taken**.
- Stacks with Unbreakable (multiplicative: 45% then up to 25%).
- Looks: spellfx `status` iron shell (use `STATUS_FX.barrier` recoloured iron grey),
  cracks spread on the ground under the feet (`crack` decal, 3 m).
- Sound: `status.barrier.apply` layered with `melee.block`, then `status.barrier.tick` every 2 s for 10 s.

**6. `warrior_faultline` — Faultline** (level 40)
- Cost **40 Momentum**. Cooldown **20 s**. **0.6 s wind-up** (rooted), then the slam.
- Targeting: **Auto-target** — the line is aimed at your hard target (or the enemy nearest your aim point
  within 16 m); with no enemy in range it fires straight ahead.
- Tags: `tag_physical`, `tag_attack`, `tag_melee`, `tag_area`.
- Shape: line **16 m long, 3 m wide**.
- Damage: **250% WD + 40% WD for every block charge**, and it **spends all your charges** (5 charges =
  450% WD). Threat ×2.
- Status: **sunder** — armour −20% for 10 s (page 05 `sunder`). Every enemy in the line is **knocked 3 m
  sideways** out of it.
- Looks: Chibi 2 clip `slam`; spellfx `crack` decals every 1 m along the line, rock-chunk `shards` burst,
  screen shake 0.6 (reuse `js/combat-feel.js`), hit-stop 150 ms.
- Sound: `stone.crumble` + `fragment.crash.large`, `status.sunder.apply` on each enemy hit.

### 3.3 Rotation / how it plays

- **Solo (open world):** Hurled Bulwark to pull a pack of 3–4 (you arrive with 2 charges). Bulwark Bash
  as they reach you (+2, stuns the caster). Iron Gale on cooldown while 3+ are alive (Unbreakable keeps
  charges coming). Faultline when you hold 4–5 charges or on the rare. Unbroken Stand only for a rare,
  a greater-rarity monster or a champion pack.
- **Dungeon, Normal (tank):** pull with Hurled Bulwark (threat ×4 on three bodies), Iron Call the moment
  the pack arrives (everything taunted, charges topped up), then Bash → Gale → Bash, Faultline aimed *through*
  the pack so the sideways knock gathers them at the line's edges. Keep Bash for gold-border casts.
- **Dungeon, Challenge and deep Depth (tank):** charges are for the boss's **tank buster** (the big single hit,
  page 11). Hold 2+ going into it. Unbroken Stand for the enrage or the second tank buster in a row. When a
  boss needs two tanks (a stacking debuff), the warrior uses **Called Out** (Iron Call tier 1) to take
  the boss back from the other tank; otherwise a follower or a hybrid tank (page 00 §6) holds adds.
- **Damage (two-hander):** see §5.

### 3.4 Boss mechanics — what a warrior can and cannot do

| Mechanic (page 11) | Warrior |
|---|---|
| Soak (orange, N pips) | **Best soaker in the game.** A soak hit is a normal hit, so a charge cuts 70% of it. With Unbroken Stand up a warrior can take a 2-pip soak alone. |
| Tank buster | Hold ≥2 charges; or Unbroken Stand; or Last Rampart as the last resort. |
| Knockback / pull | Immune during Unbroken Stand and while Unbreakable. |
| Void zone (purple) | No immunity. Movement: dodge roll (page 05) and the tier-1 **Leaping Call** talent (12 m leap). |
| Danger zone (red) | Leave on foot / dodge roll. Faultline's 0.6 s wind-up roots you — do not start it in a filling zone. |
| Adds | Iron Call (10 m) or Hurled Bulwark (25 m, 3 bodies) to pick them up. |
| Interrupts | Bulwark Bash (8 s) interrupts; tier-2 **Silencing Clang** turns it into a 4 s silence. |
| Tether (white) | Hurled Bulwark does not break tethers. |
| Unblockable attacks | Charges do nothing; Unbroken Stand's 45% still applies. |

---

## 4. Alternate spells

The warrior has no forms or stances. Two spells change with the weapon held:

| Spell | With a shield | With a two-hander |
|---|---|---|
| `warrior_bulwark_bash` | shield edge, stun 1.2 s | pommel strike, stun 0.8 s |
| `warrior_hurled_bulwark` → **`warrior_hurled_edge` "Hurled Edge"** | as §3.2 | throws the weapon: **Needs target**, one target, **130% WD**, **pulls the target 8 m toward you**, +1 charge. Tags `tag_physical` `tag_attack` `tag_ranged` `tag_projectile`. The weapon returns in 0.8 s; basic attacks are disabled until it does. Same cost and cooldown. |

A charge's value also changes (70% soak with a shield, 40% soak + 10 Momentum with a two-hander; §2.1).
Swapping weapons in combat is not allowed (page 08); the version you have is the one you pulled with.

---

## 5. The hybrid role — Damage (two-hander)

**Role focus.** The warrior uses the canon **Role focus** switch (00 §6: in the spellbook, out of combat only,
saved per Loadout), tied to the weapon: **Hybrid** needs a two-handed sword or axe equipped, and putting a shield
back in the off hand sets it to Primary. Nothing else has to change: the same six spells, the same bar. What
Hybrid changes is the charge (40% soak + 10 Momentum refund, §2.1), Hurled Edge replacing Hurled Bulwark (§4),
and which talents you pick. The Dungeon Finder queues the warrior as **Damage** while Role focus is Hybrid
(page 15), and the Second Loadout at 30 (page 07) makes the swap one click.

**The damage loop.** Bash (+2 charges, +15 Momentum) → let the pack hit you (each spent charge refunds 10
Momentum and, from calling 2, Returned Blow hits back for 40% of what it prevented and gives +8 more) →
Iron Gale as the main spender → Faultline every 20 s with 4–5 charges banked (410–450% WD). Being hit is a
damage source; that is the whole idea.

**Talent picks that make it work** (§7): Double Bash (t1b), Red Gale (t2a), Long Gale (t3a), Blood Gale
(t4b), Magma Seam (Faultline t2a), Held Line (Faultline t3b), Worldbreaker (t4a).

**Gear:** STR and crit on a two-hander; the set `set_warrior_ironbrow` 6-piece (Faultline counts charges
you hold without spending them) is the damage set; `leg_gale_eater` and `leg_faultborn_greatsword` are the
damage legendaries (§9).

**How well it does, in numbers.**

| Content | Target | Why |
|---|---|---|
| Open world, Normal dungeons | **90–95%** of a pure Damage class's sustained damage on packs of 3+, **80%** on one target | Iron Gale, Faultline and Returned Blow all scale with the number of enemies on you |
| Depth up to about 10 | **85%** on packs, **75%** single target | still fine; packs grow with Depth, which helps |
| Challenge mode | **~70%** single target | Challenge bosses are fought alone with the tank holding them, so the damage warrior is *not being hit*: no charges spent, no refunds, no Returned Blow. Its whole engine idles. Accepted by design (page 00 §6) |

---

## 6. Utility spells

None. The warrior has no out-of-combat spells; it travels with scrolls and the Recall Stone (page 20).

---

## 7. Talents

One pick per tier per spell (Farhold's rule, reuse: `prototypes/farhold/js/skilltalents.js`). Full id =
spell id + `_t<tier><letter>`, e.g. `warrior_bulwark_bash_t1a`. A tier opens at its level (12 / 22 / 32 / 45)
or when the spell unlocks, whichever is later. Each node changes what the spell does and carries its own
visual change (`fx`), so another player can see your build. A talent that changes a spell's shape or
targeting changes its tags too (noted where it does).

### Bulwark Bash
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Shield Rush** — Bash becomes a charge of up to 8 m ending in the bash; enemies on the way are shoved aside. Adds `tag_movement`. | **Double Bash** — two hits of 65% WD; the second knocks the target back 3 m. | **Ringing Rim** — the cone becomes a 3 m circle around you (Self); stun drops to 0.6 s. |
| 2 (22) | **Iron Tithe** — each charge gained by Bash also heals you 3% max health. | **Spiked Rim** — the 2 charges from Bash are *spiked*: when spent they deal 50% WD to the attacker. | **Silencing Clang** — an interrupt also **silences** the target 4 s (bosses: that spell school locked 6 s). |
| 3 (32) | **Overcharge** — Bash can push you up to 2 charges over the cap; the extra ones fall off after 6 s. | **Resounding** — spending a charge on a hit of 15%+ max health resets Bash's cooldown. | **Ringing Ear** — bashed enemies deal 20% less damage to anyone but you for 6 s. |
| 4 (45) | **Anvil of the Wall** — hold the key up to 1 s: at full hold 250% WD, stun 2.5 s, +3 charges. | **Wall of Iron** — Bash raises a 4 m wide iron wall in front for 5 s that stops enemy projectiles for anyone behind it. | — |

### Iron Call
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Leaping Call** — Ground: leap to a point up to 12 m away, then call there. Adds `tag_movement`. | **Called Out** — Needs target: single-target, 30 m range, taunt 6 s, threat set to 130% of the highest (the tool for taking a boss back from another tank). | **Dragging Call** — also pulls every enemy 4 m toward you. |
| 2 (22) | **Shoulder to Shoulder** — allies within 10 m take 10% less damage for 5 s. | **Hollow Threat** — taunted enemies deal 15% less damage for 6 s. | **Come Closer** — taunted ranged enemies and casters stop casting and walk into melee. |
| 3 (32) | **Proven** — +5 Momentum per enemy taunted. | **Second Call** — the call repeats itself once, 3 s later, in the same place. | **Grudge** — an enemy that attacks someone else within 6 s of being taunted is struck by a phantom shield for 150% WD. |
| 4 (45) | **Call of Kings** — on a boss, its next single-target attack on you deals 30% less. | **Swollen Pride** — +3% max health per enemy taunted for 10 s (max 15%). | — |

### Iron Gale
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Running Gale** — full move speed while spinning. | **Anchored Gale** — you cannot move, the circle grows to 7 m and each hit pulls enemies 1 m inward. | **Gale of Shields** — each hit that lands on 2+ enemies gives +1 charge instead of Momentum. |
| 2 (22) | **Red Gale** — every hit applies bleed, stacking to 3. | **Scouring Gale** — each hit strips 3% armour, stacking to 5 (15%). | **Throwing Gale** — the last hit sends 4 slash waves outward 10 m at 60% WD. Adds `tag_projectile`. |
| 3 (32) | **Long Gale** — keep spinning up to 4 s, paying 8 Momentum per extra hit. | **Harvest** — each kill during the gale cuts its cooldown 1 s. | **Iron Hurricane** — the last hit throws everything in the circle into the air for 1 s. |
| 4 (45) | **Eye of the Gale** — allies inside the circle take 15% less damage while you spin. | **Blood Gale** — heal 2% max health per enemy hit (per hit, not per spin). Adds `tag_heal`. | — |

### Hurled Bulwark
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Long Throw** — bounces to 5 targets. | **Pinning Throw** — hits one target only: root 3 s and a 1 s knockdown. | **Homeward** — on the way back the shield passes through a line, hitting everything for 60% WD. Adds `tag_area`. |
| 2 (22) | **Full Return** — +1 charge per target hit, max +3. | **Guardian Throw** — becomes **Ally** when you have a friendly target: they get a barrier of 15% of *your* max health for 6 s and the next attack on them is redirected to you. Adds `tag_shield`. | **Silver Rim** — every hit interrupts. |
| 3 (32) | **Follow the Shield** — press again within 2 s to dash to the last enemy it hit (up to 25 m). Adds `tag_movement`. | **Taunting Rim** — each hit taunts 3 s. | **Split Rim** — on the first hit it splits into two shields that bounce separately (6 hits). |
| 4 (45) | **Planted Shield** — the last bounce lodges it in the ground: a 3 m dome for 6 s that stops projectiles. You fight without a shield until it ends. | **Crushing Rim** — the last bounce stuns 2 s. | — |

### Unbroken Stand
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Shared Stand** — allies within 8 m also take 20% less. Adds `tag_aura`. | **Iron Burst** — activation knocks every enemy within 6 m back 5 m and interrupts. Adds `tag_area`. | **Moving Fortress** — +30% move speed while it lasts. |
| 2 (22)\* | **Last Word** — when it ends, a 6 m blast deals 50% of all damage it prevented. | **Stand Firm** — +1 s per enemy hitting you, max +5 s. | **Bloodied Stand** — heals 25% max health over its duration. Adds `tag_heal`. |
| 3 (32) | **Split Stand** — two uses of 5 s each, shared 150 s cooldown after the second. | **Rooted Stand** — you cannot move, but it is 65% less damage. | **Glare** — every enemy within 12 m is taunted for the whole duration. |
| 4 (45) | **Unfallen** — while it lasts you cannot drop below 10% health. | **Forge Heart** — every hit it reduces with a charge gives +15 Momentum and resets charge lifetime to 20 s. | — |

\* Unbroken Stand unlocks at 28, so its tiers 1 and 2 open together at 28.

### Faultline
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Crossfault** — two lines in a cross, 10 m each arm. | **Ringfault** — a 7 m circle around you instead of a line (Self). | **Long Fault** — a 28 m × 2 m line. |
| 2 (22)\* | **Magma Seam** — leaves a burning crack for 6 s (20% WD a second as fire, burn). Adds `tag_fire` `tag_duration`. | **Swallowing Fault** — pulls enemies *into* the line instead of throwing them out. | **Aftershock** — a second quake 1.5 s later for 100% WD. |
| 3 (32)\* | **Shield Seam** — every charge spent also gives you a barrier of 10% max health for 8 s. Adds `tag_shield`. | **Held Line** — spends only half your charges (rounded down), still counting all of them for damage. | **Toppling** — knockdown 1.5 s instead of the sideways knock. |
| 4 (45) | **Worldbreaker** — hitting 5+ enemies resets its cooldown (once per 20 s). | **Chasm** — the crack stays open 6 s as a wall enemies cannot walk across (they path around). | — |

\* Faultline unlocks at 40, so tiers 1–3 open together at 40.

---

## 8. Class sets

Six slots per set: head, chest, legs, hands, feet + off hand (shield) or necklace. Page 09 owns the index.

### `set_warrior_ironbrow` — The Ironbrow Bulwark (levelling-to-60 set)
Drops from the final bosses of: head `d09_warmasters_pit`, chest `d10_rimefang_caverns`, legs
`d11_saltdeep_cathedral`, hands `d12_unmade_workshop`, feet `d13_cindergate`, shield (`it_ironbrow_wall`)
`d14_ashen_reliquary`. On **Normal** a piece drops at the dungeon's level (so the set follows you from
31 to 60); on **Challenge** it drops at 60.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Bulwark Bash gives **3** charges instead of 2. | Bulwark Bash |
| 4 | Every charge spent cuts Iron Call's cooldown by 1 s. | Iron Call |
| 6 | Faultline **no longer spends charges**; instead it deals +40% WD per charge you *hold*. | Faultline |

### `set_warrior_last_rampart` — Raiment of the Last Rampart (endgame set)
This was a raid set; raids are parked (`WISHLIST.md`) and the set is kept with a new source: one piece from
each **Challenge-mode** boss of `d15_fire_court` and `d16_the_spire` (page 12 picks which boss holds which
slot), and any piece from the end chest of any dungeon at **Depth 10 or deeper** (warrior-only roll, 8%).
Always item level 60.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Unbroken Stand's cooldown is 110 s. | Unbroken Stand |
| 4 | Each Iron Gale hit that lands on 2+ enemies gives +1 charge. | Iron Gale |
| 6 | At full charges, Iron Gale becomes 7 hits, and every hit you block during the spin heals you 2% max health. | Iron Gale, Bulwark |

---

## 9. Class legendaries, uniques and souls

Legendary powers, unique powers and souls work as page 08 defines (souls: page 08 §Sockets, catalogue on
page 09). Every item below is warrior-only (`classes: ["warrior"]`) and its power names its spell.

### Legendaries
| id | Name | Slot / base | Power (name + numbers) | Drop source |
|---|---|---|---|---|
| `leg_the_unfallen_wall` | The Unfallen Wall | shield | **Wall That Remembers** — Last Rampart's cooldown is 90 s and each charge spent gives 1.2 s of immunity instead of 0.75 s. | `d15_fire_court` final boss, **Challenge** only |
| `leg_greyridge_anvil` | Greyridge Anvil | one-handed hammer | **Anvilstrike** — every 3rd Bulwark Bash is an Anvilstrike: 300% WD in a 5 m circle and +5 charges (ignores the cap for 6 s). | `d04_bellows_keep` final boss on **Challenge**, or its end chest at **Depth 5+** |
| `leg_gale_eater` | Gale-Eater | two-handed axe | **Endless Gale** — Iron Gale keeps spinning while you have Momentum (6 Momentum per hit) and each hit is 55% WD. | the world boss of `cinder_steppe` (page 13) |
| `leg_oath_of_the_breach` | Oath of the Breach | heavy chest | **Breach Holder** — Unbreakable needs only 2 enemies, and a boss counts as 5 (so a boss alone gives 15%). | the world boss of `frostmantle` (page 13) |
| `leg_faultborn_greatsword` | Faultborn | two-handed sword | **Second Seam** — Faultline fires a second line at 60% damage 90° to the first, and the charges it spent come back over 4 s. | end chest of any dungeon at **Depth 15+** (warrior-only roll) |

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_visor_of_many_blows` | Visor of Many Blows | heavy helm | Block charges last **30 s** instead of 20 s; +4% armour per charge held. | `d03_shaft_seven` boss 2 |
| `uq_callers_bell` | Caller's Bell | necklace | Iron Call taunts for **6 s** and reaches **14 m**. | `d06_sandsworn_vault` final boss |
| `uq_faultmaker` | Faultmaker | two-handed axe | Faultline is **24 m** long and leaves a 3 s snare (50%) along it. | `d13_cindergate` boss 2 on **Challenge** |
| `uq_returning_rim` | Returning Rim | shield | Hurled Bulwark's return trip heals you 4% max health per enemy it hit. | `d08_moonwell_ruins` boss 2 |

### Souls (new)
A soul sits in a **Soul socket** (page 08) and adds a behaviour. Requirement: **class Warrior** (the soul
does nothing in another class's gear; the card shows it greyed out).

| id | Name | Socket | Effect | Source |
|---|---|---|---|---|
| `soul_stonebound_oath` | Stonebound Oath | armour: chest or shield | **Unbroken Stand leaves a stone.** When Unbroken Stand ends it leaves a waist-high standing stone at your feet for 12 s (a 1.5 m block that stops projectiles and enemy movement). Allies within 4 m of the stone take 10% less damage. The stone has 25% of your max health. | `d10_rimefang_caverns` final boss, 3% on Normal / 8% on Challenge |
| `soul_thrown_gauntlet` | The Thrown Gauntlet | weapon | **Iron Call throws a gauntlet.** Iron Call also hurls an iron gauntlet at your hard target up to 30 m (Auto-target): 150% WD, it taunts that enemy for 8 s and marks it — while marked, every block charge you spend on its hits is refunded 50% of the time. Tags gained: `tag_projectile` `tag_ranged`. | quest reward from `q_calling_warrior_3` (first completion), or 1-in-400 from any rare monster level 40+ |

---

## 10. Voice and barks

- Timbre: `shared/voices.js` role `warrior` (pitch 0.30, depth 0.80, rough 0.35 — low and gravelly),
  varied per character by seed (reuse).
- Lines go through Lingo (reuse: `lingo/`), tagged `class:warrior`, so traits colour them.

| Moment | Lines (samples; Lingo varies them) |
|---|---|
| Bulwark Bash | "Down!" · "Stay there." · "Not past me." |
| Iron Call | "Me! Look at ME!" · "Over here, you cowards!" · "Who's first?" |
| Iron Gale | (a roar, no words) · "Clear the floor!" |
| Unbroken Stand | "I don't break." · "Hit harder." |
| Faultline | "Split!" · "The ground's on my side." |
| Unbreakable starts | "Four of you? Good." |
| Last Rampart | "Not. Today." |
| Critical hit | "There it is." · "Felt that one." |
| Low health (<25%) | "Healer, I'm thin!" · "Still standing… just." |
| Out of Momentum | "Need a scrap to get going." |
| Boss pulled | "Stay behind me. All of you." |

---

## 11. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Timbre `warrior` | `shared/voices.js` | voice |
| Look (war helm, chainmail, pauldrons, `fh_longsword`, `fh_heater_shield`) | `avatar-3d/data/class-outfits.json` `classes.warrior` + `js/class-outfits.js` `dressAs` | default outfit |
| Clips `bash`, `whirl`, `throw`, `slam`, `block`, `guard` | `avatar-3d/js/chibi2-motion.js` | spell animations |
| Sound ids (`melee.*`, `status.*`, `stone.crumble`, `bell.toll`…) | `sfx/data/catalog.json` via `sfx/js/sfx.js` | spell sounds |
| Visuals of Farhold `shield_bash`, `whirlwind`, `execute` | `prototypes/farhold/data/skills.json` | starting point for Bulwark Bash / Iron Gale / Faultline effects **only** — ids, names and numbers are new |
| Hit-stop, shake, knockback, stagger | `prototypes/farhold/js/combat-feel.js` | Bash, Faultline, Unbreakable immunity |
| Weapon rhythms and `guard` trait | `prototypes/farhold/js/weapons.js` | basic attacks between spells |
| Talent engine and card text | `prototypes/farhold/js/skilltalents.js` (`describeMod`) | talent cards; new mod keys needed: `charges`, `taunt`, `redirect`, `wall` |
| Quest ideas "Five in one swing", "Hold the front" | `prototypes/emberveil/data/class-quests.json` | seeds for the calling quests |

*Round 2 sweep:* the warrior's taunt **Iron Challenge** is renamed **Iron Call** (`warrior_iron_call`; talents Leaping Call, Dragging Call, Call of Kings; `uq_callers_bell`) so it does not clash with Challenge mode.
