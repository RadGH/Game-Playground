# Shadow Dancer — class design (`shadow_dancer`)

> *"You're watching me. That's the mistake. Watch the one behind you."*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Follows the class template in [page 00 §5](../00-OVERVIEW.md).
Canon facts used (page 00 §6): primary role **Damage**, hybrid role **Tank**, build **melee**, **light** armour,
resource **Tempo**, mechanic **Shadows — leaves a shadow clone, swaps places; clones soak attention**, spell
slots **1 / 4 / 10 / 18 / 28 / 40**, calling quests **6 / 20 / 40**, talent tiers **12 / 22 / 32 / 45**, cap **60**.
Owner of this file: every `shadow_dancer_*` spell, talent, set, legendary, unique and soul.

## How to read the numbers on this page

| Term | Meaning |
|---|---|
| **% WD** | percent of your main-hand weapon's damage roll. Dual wield: off-hand hits at 60% (page 05). The number is final |
| **Tempo** | the shadow dancer's resource: a **small pool that refills fast**. Pool **100**, **refills 25 per second** (a full bar every 4 s), +5% refill per Dance stack (+25% at 5). It does not drain out of combat — it just sits full. **Builders:** the refill itself; +6 per dodge in Lead Dancer (§5); Shadow Thread talent. **Spenders:** Pirouette Cut 35, Backstep Fade 30, Dusk Curtain 40, Silhouette Strike 55, Last Bow 60, Mirror Waltz 70 |
| **Shadow** | a still copy of you left where you stood; lasts 8 s; enemies ignore it (except in Lead Dancer, §5) |
| **Echo** | when you cast a damaging spell, every Shadow repeats it at 35% power from where it stands |
| GCD | 1.0 s; the shadow dancer's can be hasted to 0.7 s |
| **Targeting** | page 02 / 00 §12.1 W8. **Needs target** = will not cast without a valid hard target. **Auto-target** = with no valid target it picks the valid enemy closest to your aim point in range. **Ground**. **Self**. **Ally** (`F1`–`F5`) |
| **Tags** | page 05 §Tags owns the list. Your own cuts are `tag_physical`; **echoes** from Shadows carry `tag_shadow` as well, so Shadow-damage bonuses raise the echoes and not the dancer's own blades |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A duellist who fights with the dark of their own shape. Every step leaves a Shadow behind; the Shadows copy every cut; the dancer trades places with them faster than the eye can follow. |
| Primary role | **Damage** (melee burst, high mobility) |
| Hybrid role | **Tank** — **Lead Dancer**: Shadows become decoys that pull and soak attention while the dancer dodges (§5) |
| Build | melee |
| Armour | light (silks, half cape, soft slippers) |
| Weapons | two daggers (dual wield). A single dagger is allowed but loses off-hand hits `(reuse: farhold/js/weapons.js dagger pattern jab-jab-slash, dual wield rules)` |
| Primary attribute | DEX |
| Resource | **Tempo** + **Shadows** and **Dance** stacks |
| Companion | none — the Shadows are the companion (they take no party slot and never count toward soaks) |
| Starting kit | two Worn Daggers, light chest, light boots, 1 spell (`shadow_dancer_pirouette_cut`) |

**Playstyle in three sentences.** Move with spells that leave Shadows behind. Fight where your Shadows can
echo your cuts — they aim at your target from where they stand. Shadowswap between them to dodge, flank and
build Dance stacks, then finish with Last Bow.

---

## 2. Class mechanic — Shadows

### 2.1 How Shadows work

- Spells marked **(leaves a Shadow)** leave a Shadow at the point you left from. Shadow cap: 1 → 2 (Calling 20) → 3 (Calling 40). A new Shadow over the cap replaces the oldest.
- A Shadow is a dark-violet silhouette of your character holding your pose, 60% opacity. It **echoes**: whenever you cast a *damaging* spell, each Shadow performs the same motion at your current target from its own spot, at **35%** of the damage (`tag_shadow` added). A melee spell echoed from farther than 6 m from the target becomes a thrown shadow-knife (same damage, adds `tag_ranged` `tag_projectile`).
- In the Damage build, enemies do not attack Shadows and Shadows hold no threat (they are not bodies, page 05). **Lead Dancer** (§5) changes this.
- **Shadowswap** (Calling 6, class key **`Q`** — page 02 §5.16): you and your newest Shadow trade places instantly. 3 s cooldown, no cost, off the GCD, 0.25 s of dodge-immunity (hits that land in those frames miss you). Calling 20: swaps with the Shadow nearest your aim point if there is one.
- **Dance stacks** (Calling 6): each Shadowswap done within 8 s of the last one adds a stack (max 5): +4% damage and +5% Tempo refill per stack. Stacks fall off 8 s after your last swap.
- **Shrouded** (from Dusk Curtain and a few talents): page 05's `shrouded` status, which works as `hidden` (enemies notice you at 25% of their range; broken by attacking, casting or taking damage). The first attack from Shrouded is a guaranteed crit.

(Renamed in round 2: *Veilswap* → **Shadowswap**, the *Veiled* state → **Shrouded** (page 05 `shrouded`; "Unseen" is only the rogue's hit type), the *Unveiled* debuff →
**Revealed** — 00 §12.4. "Veil" is not used in any new name.)

### 2.2 The gauge (HUD)

- Above the Tempo bar: one **silhouette pip per Shadow** (1–3), each with a draining ring for its 8 s. The newest one is outlined white (the Shadowswap target). In Lead Dancer each pip also shows a thin health bar (the Decoy's health).
- To the right: five small **fan-shaped Dance marks** that fill violet, with an 8 s drain line under them.
- Calling 40: when three Shadows exist the pips join into a crescent and the Last Bow slot glows (**Troupe** ready).
- In the world: Shadows have a faint violet floor-shadow; the newest has a small white diamond over its head (only you see it). In Lead Dancer, Decoys show a thin red ring to the tank's party so healers can see what is soaking.

### 2.3 Calling quests (page 14 owns the quest text)

| Level | Quest id | Summary | Grants |
|---|---|---|---|
| 1 | — | — | Shadows (cap 1) and echoes. No swap. |
| 6 | `q_calling_shadow_dancer_1` | Hearthvale: a travelling troupe's dance-master challenges you to "catch your own shadow" — run a lantern-hung maze of tents at the harvest fair, swapping with lanterns (a scripted Shadowswap tutorial), then win a sparring duel on the fair's stage. | **Shadowswap**, **Dance stacks**, the gauge, and **Lead Dancer** (the Tank switch, §5). |
| 20 | `q_calling_shadow_dancer_2` | Sunscar: the glass tombs cast two shadows at noon. Retrieve the "second shadow" of a thief buried there by fighting it (it uses your own Shadow tricks against you). | **2 Shadows**; Shadowswap picks the Shadow nearest your aim point. |
| 40 | `q_calling_shadow_dancer_3` | Drowned Coast: perform the Drowned Waltz in the Saltmarch masquerade — a dialog opportunity to charm, unmask or dance with a drowned noble; each choice leads to a different duel. | **3 Shadows** and **Troupe**: while 3 Shadows exist, Last Bow calls all three in (spell 6), and echoes rise to 45%. |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Lvl | id | Name | Cost | CD | Cast | Targeting | Range / shape | Tags | Main number |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `shadow_dancer_pirouette_cut` | Pirouette Cut | 35 Tempo | — | instant | Auto-target | 3 m, 180° arc, 2 hits | `tag_physical` `tag_attack` `tag_melee` `tag_area` | 2 × 70% WD |
| 2 | 4 | `shadow_dancer_backstep_fade` | Backstep Fade | 30 Tempo | 10 s | instant | Self | 10 m leap (leaves a Shadow) | `tag_physical` `tag_attack` `tag_melee` `tag_area` `tag_movement` | dodge + 90% WD flare in 3 m |
| 3 | 10 | `shadow_dancer_silhouette_strike` | Silhouette Strike | 55 Tempo | 8 s | instant | Auto-target | 3 m, single target | `tag_physical` `tag_attack` `tag_melee` | 260% / 360% WD flanked |
| 4 | 18 | `shadow_dancer_dusk_curtain` | Dusk Curtain | 40 Tempo | 45 s | instant, off GCD | Self | 6 m circle, 6 s | `tag_shadow` `tag_area` `tag_duration` | 40% dodge, then Shrouded |
| 5 | 28 | `shadow_dancer_mirror_waltz` | Mirror Waltz | 70 Tempo | 20 s | 2.4 s channel | Self | enemies in 10 m, 6 hits | `tag_physical` `tag_attack` `tag_melee` `tag_area` `tag_channel` `tag_movement` | 6 × 80% WD |
| 6 | 40 | `shadow_dancer_last_bow` | Last Bow | 60 Tempo | 30 s | instant | Needs target | 12 m teleport, single target | `tag_physical` `tag_attack` `tag_melee` `tag_movement` | 400% + 150% per Shadow below 30% |

### 3.2 Details

**`shadow_dancer_pirouette_cut` — Pirouette Cut** (slot 1, level 1) `(new)`
- 35 Tempo · no cooldown · instant · 3 m, 180° in front.
- Targeting: **Auto-target** — turns to your hard target if it is within 3 m, otherwise toward the enemy nearest your aim point.
- Tags: `tag_physical` `tag_attack` `tag_melee` `tag_area`.
- A spin with both blades: **2 hits of 70% WD** 0.2 s apart. Echoed by Shadows (35% each hit).
- Look: half-turn spin, two violet crescents (spellfx `shadow` ribbon shaped into arcs). Sound: two quick silk whips + steel.

**`shadow_dancer_backstep_fade` — Backstep Fade** (slot 2, level 4) `(new)` **(leaves a Shadow)**
- 30 Tempo · 10 s · instant · **Self** · leap 10 m backward (or in the direction you are moving).
- Tags: `tag_movement`; the flare: `tag_physical` `tag_attack` `tag_melee` `tag_area`.
- 0.4 s of dodge-immunity at the start. The Shadow left behind **flares** once: 90% WD to enemies within 3 m of it.
- Look: a backflip into violet smoke; the Shadow stays in the take-off pose. Sound: whoosh + cloth snap.
- (Renamed: `shadow_dancer_backstep_veil` Backstep Veil → `shadow_dancer_backstep_fade` **Backstep Fade**.)

**`shadow_dancer_silhouette_strike` — Silhouette Strike** (slot 3, level 10) `(new)`
- 55 Tempo · 8 s · instant · 3 m, single target.
- Targeting: **Auto-target** (a flank needs a Shadow on the far side of whatever it picks, so most dancers keep a hard target).
- Tags: `tag_physical` `tag_attack` `tag_melee`.
- **260% WD.** From behind the target (rear 120°): +50% crit chance.
  **Flanked** (the target stands between you and one of your Shadows, within a 30° line): **360% WD** and that Shadow's echo is 70% instead of 35%.
- Look: a forward lunge that leaves a stretched silhouette; if flanked, the Shadow lunges from the other side at the same moment (a pincer). Sound: a sharp double "tak".

**`shadow_dancer_dusk_curtain` — Dusk Curtain** (slot 4, level 18) `(new)` — the defensive cooldown
- 40 Tempo · 45 s · instant, off the GCD · **Self** · a 6 m circle of darkness at your feet for 6 s.
- Tags: `tag_shadow` `tag_area` `tag_duration`.
- You and allies inside get **40% chance to dodge** attacks (100% against projectiles fired from outside the circle).
  On cast, non-boss enemies targeting you **lose you** (threat on you drops to 0 with them) — except in Lead Dancer, where it does the opposite (§5).
- If you leave the circle, you are **Shrouded** for up to 8 s or until you attack; your first attack from Shrouded crits.
- Look: a dome of dusk (spellfx `shadow` palette ground disc, smoke particles). Sound: a low wind; the world's audio is muffled for you inside.

**`shadow_dancer_mirror_waltz` — Mirror Waltz** (slot 5, level 28) `(new)` **(leaves a Shadow at the end)**
- 70 Tempo · 20 s · 2.4 s channel (you move by yourself) · **Self** — it picks enemies within 10 m.
- Tags: `tag_physical` `tag_attack` `tag_melee` `tag_area` `tag_channel` `tag_movement`.
- You dash between enemies in range for **6 hits of 80% WD**, one every 0.4 s, choosing the nearest not yet hit (then repeating). Each Shadow joins the same waltz at 35%. You are hard to hit: 50% dodge during it.
- You end at the last hit's spot; a Shadow stays where you started.
- Look: after-images between each dash (spellfx `shadow` ribbon trail), your Shadows spinning in place. Sound: a waltz beat — three soft steps then a cut, looping.

**`shadow_dancer_last_bow` — Last Bow** (slot 6, level 40) `(new)` — the finisher
- 60 Tempo · 30 s · instant · **Needs target** within 12 m (you teleport behind it).
- Tags: `tag_physical` `tag_attack` `tag_melee` `tag_movement`.
- Against a target **below 30% health**: **400% WD + 150% per Shadow** you own (Shadows step in and strike in sequence, then vanish — all Shadows are spent).
  Above 30%: 200% WD, Shadows are not spent.
- If it kills: cooldown resets and a Shadow is left at the body.
- **Troupe** (Calling 40, 3 Shadows): each Shadow's strike is 250% instead of 150% and the bow ends with a 5 m burst of 150% WD (adds `tag_area`).
- Look: you appear behind the target and bow like a dancer at a curtain call; Shadows cut through it one after another; a violet slash hangs in the air for 1 s. Sound: a held string note, three cuts, a soft "thank you" bark.

### 3.3 Rotation / how it plays

- **Solo:** Backstep Fade into a pack (Forward Fade talent) → Pirouette Cuts with the Shadow echoing → Silhouette Strike flanked → Shadowswap out of big hits. Last Bow picks off the champion.
- **Dungeon (damage):** park a Shadow on the far side of the boss at the pull (Backstep through, swap back). Keep Silhouette on cooldown flanked; Mirror Waltz on every pack. Dusk Curtain when a void zone or an add wave lands on the group. With 2–3 Shadows around the boss's back arc every Silhouette is a flank. Save Last Bow + Troupe for the last 30%.
- **Tempo:** at 25 per second the dancer can cast Pirouette Cut on every GCD for about 10 s before it has to skip one; a Silhouette + Waltz + Last Bow burst costs 185 and needs ~3 s of Pirouette-free time to refill. Dance stacks (+25% refill) are what make the burst window.

### 3.4 Boss mechanics

| Mechanic | Shadow dancer answer |
|---|---|
| Danger zones (red) | Shadowswap out — pre-place a Shadow on the safe side. 0.25 s of dodge-immunity. |
| Void zones | Shadows can stand in void zones and keep echoing (they take no damage from them). |
| Soaks | Your Shadows **never** count as players for soaks (00 §10). |
| Targeted (yellow) circles | Backstep Fade away from the group; Shadowswap back after it lands. |
| Tethers | Shadowswap breaks a distance tether at once if the Shadow is far enough away. |
| Interrupts | Sever Sight talent. |
| Boss must be hit from the front / back | Silhouette's flank does not care about the boss's facing — only the Shadow line. |
| Adds | Mirror Waltz; the Decoy talent (or Lead Dancer) holds them off the healer. |

---

## 4. Alternate spells

| Trigger | Replaces | Becomes | Numbers |
|---|---|---|---|
| **Shrouded** (after Dusk Curtain or a talent) | Pirouette Cut | **Curtain Rise** `shadow_dancer_curtain_rise` | Auto-target opener: 300% WD, stuns non-bosses 2 s, leaves a Shadow at your side. Tags `tag_physical` `tag_attack` `tag_melee` |
| 5 Dance stacks | Backstep Fade | **Encore** `shadow_dancer_encore` | Needs target; free, no cooldown, one use: leap to your newest Shadow's side and move every Shadow to the mirrored spot around the target (sets up flanks). Tags `tag_movement` |
| **Lead Dancer** on | Last Bow | **Curtain Call** `shadow_dancer_curtain_call` | see §5 |

---

## 5. The hybrid role — Tank (Lead Dancer)

**Role focus.** The shadow dancer uses the canon **Role focus** switch (00 §6: in the spellbook `K`, out of
combat only, saved per Loadout). Setting it to **Hybrid** turns on **Lead Dancer** — the two are one switch
(3 s to swap; unlocked at Calling 6) — and the Dungeon Finder then queues the dancer as **Tank**. Lead Dancer is an **evasion tank**: it
does not block or soak with armour — its Shadows pull and absorb attention and the dancer is hard to hit.

**While Lead Dancer is on:**

| Piece | What changes |
|---|---|
| Damage and threat | your damage **−25%**; **all** threat you and your echoes make **×3** |
| Base mitigation | **−15% damage taken** (the light-armour tank's floor) |
| **Evasion** | **20% dodge** against melee and projectile attacks, **+5% per Dance stack** (max **45%**). Against a **boss**: 15% + 3% per stack (max **30%**). Tank busters, area hits and every telegraphed mechanic (page 11) **cannot** be dodged |
| **Footwork** | each dodge gives **+6 Tempo** and adds a Dance stack (at most one stack per 1 s), so dodging feeds the next dodge |
| **Decoys** | every Shadow you make is a **Decoy**: a body with **15% of your max health** (your armour). When it appears it **taunts non-boss enemies within 6 m for 3 s**. While it stands, **25% of attacks** from non-boss enemies within 5 m of it that are aimed at you **go to the Decoy instead** (the hit lands on its health). A Decoy that is destroyed **flares** (90% WD in 3 m) and is gone. Decoys never count toward soaks and bosses never switch to them |
| Pirouette Cut | makes ×5 threat (not ×3) — the pack-holding filler |
| Silhouette Strike | also **taunts** the target for 3 s (the single-target taunt, 8 s cooldown) |
| Backstep Fade | its Decoy's taunt reaches 8 m — the pick-up tool |
| Dusk Curtain | enemies do **not** lose you: instead you get **+40% dodge** (on top of Evasion, cap 85%; against bosses cap 60%) for 6 s, and allies inside keep their 40%. The big defensive |
| Mirror Waltz | taunts every enemy it hits for 4 s, and you take 30% less damage during the channel |
| Last Bow → **Curtain Call** `shadow_dancer_curtain_call` | Needs target, 12 m: you appear before the target (not behind), **taunt it for 8 s** and it deals 20% less damage to you for 8 s; 200% WD; Shadows are not spent. Tags `tag_physical` `tag_attack` `tag_melee` `tag_movement` `tag_duration` |

**Talents that help:** Backstep Fade t2a *Decoy* (stacks with Lead Dancer: 6 m → 10 m taunt), t4a *Fading Line*
(more Decoys); Dusk Curtain t1a *Moving Dusk*, t3b *Swallowed Light*; Mirror Waltz t3b *Untouchable*; Pirouette
Cut t3a *Rhythm* (more Dance stacks, more dodge). **Gear:** DEX and dodge affixes, a Jewel with dodge or
health, the soul `soul_masked_partner` (§9).

**How good it is.** Against a pack of normal enemies a Lead Dancer with 3 Decoys and 3 Dance stacks takes
about the same damage over 30 s as a heavy-armour tank — but it arrives in **spikes**: a run of three landed
hits can take 35% of its health, where a plate tank's damage is smooth. That is fine in the **open world,
Normal dungeons and Depth up to about 10**, where healers have room for spikes. Against **Challenge-mode**
bosses the boss dodge cap (30%) and the rule that tank busters cannot be dodged make it the weakest of the
tanks: Dusk Curtain covers one tank buster in three, so a Challenge group needs a healer who watches it closely.

---

## 6. Utility spells

None. The shadow dancer has no travel or ritual spells; it uses scrolls and the Recall Stone ([page 20](../20-TRAVEL.md)).

---

## 7. Talents

One pick per tier. Tiers open at **12 / 22 / 32 / 45** (the later of the tier's level and the spell's slot level).
Ids `<spellid>_t<tier><a|b|c>`. `(reuse: prototypes/farhold/js/skilltalents.js)`

### Pirouette Cut
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `shadow_dancer_pirouette_cut_t1a` | Full Turn | 360° around you, 3.5 m. |
| 12 | `shadow_dancer_pirouette_cut_t1b` | Forward Step | Moves you 3 m forward while spinning. Adds `tag_movement`. |
| 22 | `shadow_dancer_pirouette_cut_t2a` | Silk Bleed | Each hit leaves Bleeding (60% WD over 6 s, stacks 3). Adds `tag_duration`. |
| 22 | `shadow_dancer_pirouette_cut_t2b` | Tangle Step | Hits slow enemies 30% for 2 s. |
| 32 | `shadow_dancer_pirouette_cut_t3a` | Rhythm | Every 3rd Pirouette Cut in 10 s adds a Dance stack. |
| 32 | `shadow_dancer_pirouette_cut_t3b` | Shadow Thread | Echoed hits from Shadows restore 3 Tempo each. |
| 45 | `shadow_dancer_pirouette_cut_t4a` | Grand Pirouette | 4 hits of 50%, and the last one throws 3 shadow-knives 10 m in a fan (`tag_ranged` `tag_projectile`). |
| 45 | `shadow_dancer_pirouette_cut_t4b` | Partnered | Your newest Shadow steps to the far side of the target on every cast (always flanked; once per 12 s). |

### Backstep Fade
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `shadow_dancer_backstep_fade_t1a` | Forward Fade | Leaps **through** the target to 8 m behind it; the Shadow is left in front of it. |
| 12 | `shadow_dancer_backstep_fade_t1b` | Short Step | 6 m, 2 charges. |
| 22 | `shadow_dancer_backstep_fade_t2a` | Decoy | The Shadow taunts non-boss enemies within 6 m for 2 s (the one exception to "Shadows hold no threat" in the Damage build; in Lead Dancer the taunt reaches 10 m). |
| 22 | `shadow_dancer_backstep_fade_t2b` | Smoke Burst | The flare also blinds non-bosses 2 s (they miss 50%). |
| 32 | `shadow_dancer_backstep_fade_t3a` | Slip Away | You are Shrouded for 3 s after landing. |
| 32 | `shadow_dancer_backstep_fade_t3b` | Recoil | Shadowswap's cooldown resets on use. |
| 45 | `shadow_dancer_backstep_fade_t4a` | Fading Line | Leaves a Shadow every 3 m along the leap (up to your cap). |
| 45 | `shadow_dancer_backstep_fade_t4b` | Undertow | Enemies near the Shadow are pulled 3 m toward it (not bosses). |

(Renamed: *Forward Veil* → **Forward Fade**, *Unseen* (talent) → **Slip Away** — the state is **Shrouded**; "Unseen" belongs to the rogue.)

### Silhouette Strike
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `shadow_dancer_silhouette_strike_t1a` | Long Silhouette | 8 m reach: you lunge to the target. Adds `tag_movement`. |
| 12 | `shadow_dancer_silhouette_strike_t1b` | Twin Silhouette | Two strikes of 150%, both check flank separately. |
| 22 | `shadow_dancer_silhouette_strike_t2a` | Open Wound | Flanked strikes leave **Revealed** (`revealed`): +12% damage taken from you for 8 s. Adds `tag_curse` `tag_duration`. |
| 22 | `shadow_dancer_silhouette_strike_t2b` | Sever Sight | Interrupts non-boss casts; on a boss, interrupts a gold-bordered cast (once per 20 s). |
| 32 | `shadow_dancer_silhouette_strike_t3a` | Mirror Cut | A flanked strike leaves a new Shadow opposite the one that flanked. |
| 32 | `shadow_dancer_silhouette_strike_t3b` | Refund | A flanked strike refunds 25 Tempo. |
| 45 | `shadow_dancer_silhouette_strike_t4a` | Crossfire | Every Shadow that flanks counts: +100% per flanking Shadow. |
| 45 | `shadow_dancer_silhouette_strike_t4b` | From the Dark | From Shrouded, it always counts as flanked and does not break Shrouded if it kills. |

### Dusk Curtain
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `shadow_dancer_dusk_curtain_t1a` | Moving Dusk | The circle follows you (4 m). |
| 12 | `shadow_dancer_dusk_curtain_t1b` | Wide Dusk | 10 m: the whole party can stand in it. |
| 22 | `shadow_dancer_dusk_curtain_t2a` | Dusk Lens | Non-boss enemies inside the curtain are blinded (miss 50%). |
| 22 | `shadow_dancer_dusk_curtain_t2b` | Dusk Shift | Casting it Shadowswaps you to your newest Shadow first and drops the curtain there. |
| 32 | `shadow_dancer_dusk_curtain_t3a` | Cleansing Dark | Removes one movement-impairing effect from each ally inside on cast. |
| 32 | `shadow_dancer_dusk_curtain_t3b` | Swallowed Light | Void-zone damage to allies inside is halved. |
| 45 | `shadow_dancer_dusk_curtain_t4a` | Lights Up | When the curtain ends, every Shadow echoes a free Pirouette Cut. |
| 45 | `shadow_dancer_dusk_curtain_t4b` | Long Dusk | 30 s cooldown, 4 s duration. |

(Renamed: *Night Lens* → **Dusk Lens**, *Endless Night* → **Long Dusk** — no night in Wildmarch.)

### Mirror Waltz
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `shadow_dancer_mirror_waltz_t1a` | Duet | Becomes **Needs target**: all 6 hits on your target, 100% each. |
| 12 | `shadow_dancer_mirror_waltz_t1b` | Grand Ball | Range 16 m, 8 hits of 65%. |
| 22 | `shadow_dancer_mirror_waltz_t2a` | Partners Swap | Each hit adds a Dance stack. |
| 22 | `shadow_dancer_mirror_waltz_t2b` | Trailing Shadows | Leaves a Shadow at every other hit spot (up to cap). |
| 32 | `shadow_dancer_mirror_waltz_t3a` | Controlled Step | You steer: the next enemy is the one nearest your aim point. |
| 32 | `shadow_dancer_mirror_waltz_t3b` | Untouchable | 100% dodge during the channel (not void zones or telegraphed mechanics). |
| 45 | `shadow_dancer_mirror_waltz_t4a` | Masquerade | Shadows waltz separately on their own enemies (a full 6 hits each at 35%). |
| 45 | `shadow_dancer_mirror_waltz_t4b` | Final Figure | The last hit is 300% and resets Silhouette Strike. |

### Last Bow
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `shadow_dancer_last_bow_t1a` | Early Curtain | Finisher threshold 35%. |
| 12 | `shadow_dancer_last_bow_t1b` | Keep Your Shadows | Shadows are not spent (their strikes are 100% each instead). |
| 22 | `shadow_dancer_last_bow_t2a` | Bouquet | A kill also refills Tempo to 100. |
| 22 | `shadow_dancer_last_bow_t2b` | Bow Out | After the bow you Shadowswap to your oldest Shadow's former spot and are Shrouded 3 s. |
| 32 | `shadow_dancer_last_bow_t3a` | Encore Bow | A kill lets you cast Last Bow once more within 5 s on a different target. |
| 32 | `shadow_dancer_last_bow_t3b` | Solo Act | With no Shadows, 500% instead of 400%. |
| 45 | `shadow_dancer_last_bow_t4a` | Troupe Leader | Troupe works with 2 Shadows. |
| 45 | `shadow_dancer_last_bow_t4b` | Final Curtain | Against bosses below 10%: 900% WD, 90 s cooldown for that use. |

Curtain Call (the Lead Dancer version) takes the Last Bow talents that make sense for it: *Keep Your Shadows*
is built in; *Bow Out* makes you Shrouded for 0 s (no effect) and instead gives +20% dodge for 3 s.

---

## 8. Class sets

### `set_shadow_dancer_masquerade_silks` — Masquerade Silks (levels 22–30, dungeon set)
Drops from `d06_sandsworn_vault`, `d07_thornheart` and `d08_moonwell_ruins` bosses on **Normal** (12% per boss,
at the dungeon's level) and **Challenge** (item level 60); their Depth end chests can drop it too.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Echoes are 40% instead of 35%. | Shadows |
| 4 | Backstep Fade leaves 2 Shadows (one at take-off, one halfway). | `shadow_dancer_backstep_fade` |
| 6 | Silhouette Strike from Shrouded resets Dusk Curtain's cooldown (once per 90 s). | `shadow_dancer_silhouette_strike`, `shadow_dancer_dusk_curtain` |

### `set_shadow_dancer_choir_of_the_unlit` — Choir of the Unlit (levels 42–45, dungeon set)
Drops from `d11_saltdeep_cathedral` bosses on **Normal** (15%) and **Challenge** (item level 60), and from the
world boss of `drowned_coast` (`b_sallow_king`, page 13; one random piece, 10%). *(Was a raid set from r03;
raids are in `WISHLIST.md`.)*

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Pirouette Cut costs 30 Tempo. | `shadow_dancer_pirouette_cut` |
| 4 | Mirror Waltz leaves a Shadow at every hit spot. | `shadow_dancer_mirror_waltz` |
| 6 | Dance stacks go to 8 (each +4% damage; in Lead Dancer each +5% dodge, the caps do not change). | Dance |

### `set_shadow_dancer_duskwoven_garb` — Duskwoven Garb (level 60, endgame set)
Item level 60. Drops from **Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per boss;
page 12 names which) and from the **end chest of any dungeon at Depth 10 or deeper** (one random piece, 8%).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Shadowswap cooldown 2 s. | Shadowswap |
| 4 | Last Bow's Shadow strikes each leave a 3 m pool of shadow on the target's spot (enemies only, 30% WD every 0.5 s for 3 s, `tag_shadow` `tag_area` `tag_duration`). | `shadow_dancer_last_bow` |
| 6 | You may hold 4 Shadows. | Shadows |

(Renamed: `set_shadow_dancer_veilwoven_garb` Veilwoven Garb → `set_shadow_dancer_duskwoven_garb` **Duskwoven Garb**.)

---

## 9. Class legendaries, uniques and souls

### Legendaries
| id | Name | Slot | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_twin_of_the_moonwell` | Twin of the Moonwell | dagger (main) | Your newest Shadow **attacks on its own** with your basic attacks at 35% (not only spells). | `b_oruvel_moon_drinker` Oruvel, That Which Drank the Moon (`d08_moonwell_ruins` end boss) on Challenge, 4%; its Depth end chest 2% |
| `leg_curtainfall_slippers` | Curtainfall Slippers | feet | Every Shadowswap leaves a 3 m patch of dusk for 3 s (Dusk Curtain's dodge, no Shrouded). | `b_the_tidewife` The Tidewife (`d11_saltdeep_cathedral` secret boss) on Challenge, 3% |
| `leg_the_understudy` | The Understudy | dagger (off hand) | If you would die, you swap with your newest Shadow instead and it dies in your place (you keep 1 health; 180 s cooldown). | a Challenge-mode `d15_fire_court` boss (page 12 names which), 5% |
| `leg_lantern_eaters_mask` | Lantern-Eater's Mask | head | While you are Shrouded, and for 4 s after you leave it, Shadows echo at 60%. | `b_hungering_brood` The Hungering Brood (`whisperwood` world boss, page 13), once a week, 6% |

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_nettle_waltz` | Nettle Waltz | dagger | Pirouette Cut hits apply Poisoned (50% WD over 6 s, `tag_poison` `tag_duration`). | `b_wren_grist` Wren Grist, the Miller's Wife (`d02_drowned_mill` boss 2) |
| `uq_dusk_silk_sash` | Dusk-Silk Sash | waist | Dusk Curtain +2 s; Shrouded lasts 12 s. | `b_king_sethar_unshattered` King Sethar the Unshattered (`d05_glass_tombs` end boss) |
| `uq_pinwheel_blades` | Pinwheel Blades | dagger pair (one item fills both hands) | Mirror Waltz hits +2 targets per hop (3 m splash). | `b_warmaster_drogath` Warmaster Drogath Ashmane (`d09_warmasters_pit` end boss) |

### Souls
A soul goes in a **Soul** socket (page 08) and adds a behaviour. Both need the wearer to be a **shadow dancer**.

| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_masked_partner` | Soul of the Masked Partner | armour — chest | class: shadow dancer | In **Lead Dancer**, when a Decoy is destroyed you gain a barrier of 10% of your max health for 5 s (`tag_shield`) and your next Pirouette Cut costs nothing. In the Damage build, a Shadow that expires on its own echoes one last free Pirouette Cut. | `b_first_sleeper` The First Sleeper (`d01_hollow_barrow` secret boss) on Challenge, 3%; end chest at **Depth 10+**, 1% |
| `soul_final_bow` | Soul of the Final Bow | weapon | class: shadow dancer | When Last Bow kills, every enemy within 8 m of the body becomes **Revealed** for 6 s (+12% damage from you) and you gain a Shadow at each of up to 2 of them. | end chest at **Depth 15+**, 1%; the world boss of `riftmarch` (`b_unmoored`), 2% |

---

## 10. Voice and barks

- Timbre: `voiceFor({ role: 'rogue', gender, seed })`, breathy (breath 0.4), light, quick word gap. Lines are often whispered (volume −4 dB). `(reuse: shared/voices.js)`

| Event | Lines |
|---|---|
| Leave a Shadow | "Keep my place." · "Wait here." |
| Shadowswap | "Over here." · "Wrong one." |
| Flanked strike | "Look behind you." · "Between us." |
| Decoy taunts (Lead Dancer) | "Dance with *her*." · "Eyes on the pretty one." |
| Dodge (Lead Dancer, 1 in 5) | "Missed." · "Not even close." |
| Last Bow kill | "Thank you, you've been lovely." · "And… scene." |
| Crit | "Too slow." |
| Low health | "The music's stopping — help!" · "I'm fading!" |
| Out of Tempo | "Need a breath." |

---

## 11. Reuse notes

| Wildmarch piece | Borrowed from | Notes |
|---|---|---|
| Shadows / Decoys | Chibi 2 actor cloned with a translucent violet material (`avatar-3d/js/chibi2.js`) | a pose copy, no AI; a Decoy is the same mesh given a body and health (`(new)`) |
| Backstep / Last Bow teleport | Farhold `shadowstep` dash | visuals |
| Dusk Curtain | Farhold `smoke` + spellfx `shadow` ground disc | a group circle |
| Shrouded | Farhold `stealth` stat as page 05's `shrouded` status (works as `hidden`) | same rule |
| Mirror Waltz | Farhold `whirlwind` repeat engine (`repeats`) | moving version |
| Outfit | no `shadow_dancer` row in `class-outfits.json` yet — **add one** (silks, half cape, knife rig, slippers) from Farhold `data/classes.json` `shadow_dancer.look` | See QUESTIONS.md G4 |
| Talent engine | `prototypes/farhold/js/skilltalents.js` | Wildmarch tier levels |
| Emberveil 2 prototype ideas | `sd_shadow_strike`, `smoke_veil`, `assassinate`, `dance_of_blades` | reborn as Silhouette Strike, Dusk Curtain, Last Bow, Mirror Waltz |
