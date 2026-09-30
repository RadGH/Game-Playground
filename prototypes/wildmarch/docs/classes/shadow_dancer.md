# Shadow Dancer — class 27

> *"You're watching me. That's the mistake. Watch the one behind you."*

**Role:** Damage · **Armour:** light · **Resource:** Focus + **Shadows** and **Dance** stacks · **Primary attribute:** DEX
Owner of this file: every `shadow_dancer_*` spell, talent, set, legendary and unique. Template: [page 00 §5](../00-OVERVIEW.md).

### Numbers used on this page

| Term | Meaning |
|---|---|
| **% weapon** | percent of your main-hand weapon's damage roll. Dual wield: off-hand hits at 60% (page 05) |
| Focus | 0–100, regenerates 14 per second (+10% per Dance stack) |
| Shadow | a still copy of you left where you stood; lasts 8 s; cannot be hit (enemies ignore it) |
| Echo | when you cast a damaging spell, every Shadow repeats it at 35% power from where it stands |
| GCD | 1.0 s, the Shadow Dancer's can be hasted to 0.7 s |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A duellist who fights with the dark of their own shape. Every step leaves a Shadow behind; the Shadows copy every cut; the dancer trades places with them faster than the eye can follow. |
| Role | Damage (melee burst, high mobility). |
| Armour | light (silks, half cape, soft slippers) |
| Weapons | two daggers (dual wield). A single dagger + nothing is allowed but loses off-hand hits. `(reuse: farhold/js/weapons.js dagger pattern jab-jab-slash, dual wield rules)` |
| Resource | Focus |
| Companion | none — the Shadows are the companion. |
| Playstyle | 1) Move with spells that leave Shadows behind. 2) Fight where your Shadows can echo your cuts (they aim at your target from where they stand). 3) Veilswap between them to dodge, flank and build Dance stacks, then finish with Last Bow. |

Starting kit: two Worn Daggers, light chest, light boots, 1 spell (`shadow_dancer_pirouette_cut`).

---

## 2. Class mechanic — Shadows

### 2.1 How Shadows work

- Spells marked **(leaves a Shadow)** leave a Shadow at the point you left from. Shadow cap: 1 → 2 (Calling 20) → 3 (Calling 40). A new Shadow over the cap replaces the oldest.
- A Shadow is a dark-violet silhouette of your character holding your pose, 60% opacity. It **echoes**: whenever you cast a *damaging* spell, each Shadow performs the same motion at your current target from its own spot, at **35%** of the damage. A melee spell echoed from farther than 6 m from the target becomes a thrown shadow-knife (same damage).
- Enemies do not attack Shadows, and Shadows do not hold threat (page 05: they are not bodies).
- **Veilswap** (Calling 6, class key `Q` — page 02 §5.16): you and your newest Shadow trade places instantly. 3 s cooldown, no cost, off the GCD, 0.25 s of dodge-immunity (i-frames: frames where hits miss you). Calling 20: swaps with the Shadow under your crosshair if there is one.
- **Dance stacks** (Calling 6): each Veilswap done within 8 s of the last one adds a stack (max 5): +4% damage and +10% Focus regen per stack. Stacks fall off 8 s after your last swap.

### 2.2 The gauge (HUD)

- Above the Focus bar: one **silhouette pip per Shadow** (1–3), each with a draining ring for its 8 s. The newest one is outlined white (the Veilswap target).
- To the right: five small **fan-shaped Dance marks** that fill violet, with an 8 s drain line under them.
- Calling 40: when three Shadows exist the pips join into a crescent and the Last Bow slot glows (**Troupe** ready).
- In the world: Shadows have a faint violet floor-shadow; the newest has a small white diamond over its head (only you see it).

### 2.3 Calling quests

| Level | Quest id | Summary | Grants |
|---|---|---|---|
| 1 | — | — | Shadows (cap 1) and echoes. No swap. |
| 6 | `q_calling_shadow_dancer_1` | Hearthvale: a travelling troupe's dance-master challenges you to "catch your own shadow" — follow a lamp-lit path at night, swapping with lanterns (a scripted Veilswap tutorial), then win a sparring duel at the harvest fair. | **Veilswap**, **Dance stacks**, and the gauge. |
| 20 | `q_calling_shadow_dancer_2` | Sunscar: the glass tombs cast two shadows at noon. Retrieve the "second shadow" of a thief buried there by fighting it (it uses your own Shadow tricks against you). | **2 Shadows**; Veilswap picks the Shadow under your crosshair. |
| 40 | `q_calling_shadow_dancer_3` | Drowned Coast: perform the Drowned Waltz in the Saltmarch masquerade — a dialog opportunity to charm, unmask or dance with a drowned noble; each choice leads to a different duel. | **3 Shadows** and **Troupe**: while 3 Shadows exist, Last Bow calls all three in (see spell 6), and echoes rise to 45%. |

---

## 3. The six spells

### 3.1 At a glance

| Slot | id | Name | Lvl | Cost | CD | Cast | Range | Shape | Main number |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `shadow_dancer_pirouette_cut` | Pirouette Cut | 1 | 25 Focus | — | instant | 3 m | 180° arc, 2 hits | 2 × 70% weapon |
| 2 | `shadow_dancer_backstep_veil` | Backstep Veil | 4 | 20 Focus | 10 s | instant | 10 m leap | self (leaves a Shadow) | dodge + 90% weapon in 3 m where you left |
| 3 | `shadow_dancer_silhouette_strike` | Silhouette Strike | 10 | 40 Focus | 8 s | instant | 3 m | single target | 260% / 360% weapon flanked |
| 4 | `shadow_dancer_dusk_curtain` | Dusk Curtain | 18 | 30 Focus | 45 s | instant | self | 6 m circle | 40% dodge, stealth |
| 5 | `shadow_dancer_mirror_waltz` | Mirror Waltz | 28 | 50 Focus | 20 s | 2.4 s channel | 10 m | moving, 6 hits | 6 × 80% weapon |
| 6 | `shadow_dancer_last_bow` | Last Bow | 40 | 40 Focus | 30 s | instant | 3 m (teleport 12 m) | single target | 400% + 150% per Shadow below 30% HP |

### 3.2 Details

**`shadow_dancer_pirouette_cut` — Pirouette Cut** (slot 1, level 1) `(new)`
- 25 Focus · no cooldown · instant · 3 m, 180° in front.
- A spin with both blades: **2 hits of 70% weapon** 0.2 s apart. Echoed by Shadows (35% each hit).
- Look: half-turn spin, two violet crescents (spellfx `shadow` ribbon shaped into arcs). Sound: two quick silk whips + steel.

**`shadow_dancer_backstep_veil` — Backstep Veil** (slot 2, level 4) `(new)` **(leaves a Shadow)**
- 20 Focus · 10 s · instant · leap 10 m backwards (or in the direction you are moving).
- 0.4 s of dodge-immunity at the start. The Shadow left behind **flares** once: 90% weapon to enemies within 3 m of it.
- Look: a backflip into violet smoke; the Shadow stays in the take-off pose. Sound: whoosh + cloth snap.

**`shadow_dancer_silhouette_strike` — Silhouette Strike** (slot 3, level 10) `(new)`
- 40 Focus · 8 s · instant · 3 m, single target.
- **260% weapon.** From behind the target (rear 120°): +50% crit chance.
  **Flanked** (the target stands between you and one of your Shadows, within a 30° line): **360% weapon** and the Shadow's echo is 70% instead of 35%.
- Look: a forward lunge that leaves a stretched silhouette; if flanked, the Shadow lunges from the other side at the same moment (a pincer). Sound: a sharp double "tak".

**`shadow_dancer_dusk_curtain` — Dusk Curtain** (slot 4, level 18) `(new)` — defensive cooldown
- 30 Focus · 45 s · instant, off the GCD · self · a 6 m circle of darkness at your feet for 6 s.
- You and allies inside get **40% chance to dodge** attacks (100% against ranged projectiles fired from outside).
  On cast, non-boss enemies targeting you **lose you** (threat on you drops to 0 with them).
- If you leave the circle, you are **Veiled** (stealth, page 05) for up to 8 s or until you attack; your first attack from Veiled crits.
- Look: a dome of dusk (spellfx `shadow` palette ground disc, smoke particles). Sound: a low wind, muffled world audio for you inside.

**`shadow_dancer_mirror_waltz` — Mirror Waltz** (slot 5, level 28) `(new)` **(leaves a Shadow at the end)**
- 50 Focus · 20 s · 2.4 s channel (you move by itself) · all enemies within 10 m.
- You dash between enemies in range for **6 hits of 80% weapon**, one every 0.4 s, choosing the nearest not yet hit (then repeats). Each Shadow joins in the same waltz at 35%. You are hard to hit: 50% dodge during it.
- You end at the last hit's spot; a Shadow stays where you started.
- Look: after-images between each dash (spellfx `shadow` ribbon trail), your Shadows spinning in place. Sound: a waltz beat — three soft steps then a cut, looping.

**`shadow_dancer_last_bow` — Last Bow** (slot 6, level 40) `(new)` — finisher
- 40 Focus · 30 s · instant · single target within 12 m (you teleport behind it).
- Against a target **below 30% health**: **400% weapon + 150% per Shadow** you own (Shadows step in and strike in sequence, then vanish — all Shadows are spent).
  Above 30%: 200% weapon, Shadows are not spent.
- If it kills: cooldown resets and a Shadow is left at the corpse.
- **Troupe** (Calling 40, 3 Shadows): each Shadow's strike is 250% instead of 150% and the bow ends with a 5 m burst of 150% weapon.
- Look: you appear behind the target, bow like a dancer at a curtain call; Shadows cut through it one after another; a violet slash hangs in the air for 1 s. Sound: a held string note, three cuts, a soft "thank you" bark.

---

## 4. Alternate spells

| Trigger | Replaces | Becomes | Numbers |
|---|---|---|---|
| **Veiled** (stealth, after Dusk Curtain or talent) | Pirouette Cut | **Curtain Rise** `shadow_dancer_curtain_rise` | opener: 300% weapon, stuns non-bosses 2 s, leaves a Shadow at your side |
| 5 Dance stacks | Backstep Veil | **Encore** `shadow_dancer_encore` | free, no cooldown, one use: leap to your newest Shadow's side and swap every Shadow's position with a mirrored spot around the target (sets up flanks) |

---

## 5. Talents (tiers at 12 / 22 / 32 / 45)

### Pirouette Cut
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `shadow_dancer_pirouette_cut_t1a` | Full Turn | 360° around you, 3.5 m. |
| 12 | `shadow_dancer_pirouette_cut_t1b` | Forward Step | Moves you 3 m forward while spinning. |
| 22 | `shadow_dancer_pirouette_cut_t2a` | Silk Bleed | Each hit leaves Bleeding (60% weapon over 6 s, stacks 3). |
| 22 | `shadow_dancer_pirouette_cut_t2b` | Tangle Step | Hits slow enemies 30% for 2 s. |
| 32 | `shadow_dancer_pirouette_cut_t3a` | Rhythm | Every 3rd Pirouette Cut in 10 s adds a Dance stack. |
| 32 | `shadow_dancer_pirouette_cut_t3b` | Shadow Thread | Echoed hits from Shadows restore 3 Focus each. |
| 45 | `shadow_dancer_pirouette_cut_t4a` | Grand Pirouette | 4 hits of 50% and the last one throws 3 shadow-knives 10 m in a fan. |
| 45 | `shadow_dancer_pirouette_cut_t4b` | Partnered | Your newest Shadow steps to the far side of the target on every cast (always flanked, 12 s ICD — internal cooldown, how often it can happen). |

### Backstep Veil
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `shadow_dancer_backstep_veil_t1a` | Forward Veil | Leaps **through** the target to 8 m behind it; the Shadow is left in front of it. |
| 12 | `shadow_dancer_backstep_veil_t1b` | Short Step | 6 m, 2 charges. |
| 22 | `shadow_dancer_backstep_veil_t2a` | Decoy | The Shadow taunts non-boss enemies within 6 m for 2 s (the one exception to "Shadows hold no threat"). |
| 22 | `shadow_dancer_backstep_veil_t2b` | Smoke Burst | The flare also blinds non-bosses 2 s (they miss 50%). |
| 32 | `shadow_dancer_backstep_veil_t3a` | Unseen | Veiled for 3 s after landing. |
| 32 | `shadow_dancer_backstep_veil_t3b` | Recoil | Veilswap cooldown resets on use. |
| 45 | `shadow_dancer_backstep_veil_t4a` | Fading Line | Leaves a Shadow every 3 m along the leap (up to your cap). |
| 45 | `shadow_dancer_backstep_veil_t4b` | Undertow | Enemies near the Shadow are pulled 3 m toward it (not bosses). |

### Silhouette Strike
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `shadow_dancer_silhouette_strike_t1a` | Long Silhouette | 8 m reach: you lunge to the target. |
| 12 | `shadow_dancer_silhouette_strike_t1b` | Twin Silhouette | Two strikes of 150%, both check flank separately. |
| 22 | `shadow_dancer_silhouette_strike_t2a` | Open Wound | Flanked strikes leave **Unveiled** (`unveiled`): +12% damage taken from you for 8 s. |
| 22 | `shadow_dancer_silhouette_strike_t2b` | Sever Sight | Interrupts non-boss casts; on a boss, interrupts a gold-bordered cast (20 s ICD). |
| 32 | `shadow_dancer_silhouette_strike_t3a` | Mirror Cut | A flanked strike leaves a new Shadow opposite the one that flanked. |
| 32 | `shadow_dancer_silhouette_strike_t3b` | Refund | A flanked strike refunds 25 Focus. |
| 45 | `shadow_dancer_silhouette_strike_t4a` | Crossfire | Every Shadow that flanks counts: +100% per flanking Shadow. |
| 45 | `shadow_dancer_silhouette_strike_t4b` | From the Dark | From Veiled, it always counts as flanked and does not break stealth if it kills. |

### Dusk Curtain
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `shadow_dancer_dusk_curtain_t1a` | Moving Dusk | The circle follows you (4 m). |
| 12 | `shadow_dancer_dusk_curtain_t1b` | Wide Dusk | 10 m, the whole group can stand in it. |
| 22 | `shadow_dancer_dusk_curtain_t2a` | Night Lens | Enemies inside the curtain are blinded (miss 50%, non-boss). |
| 22 | `shadow_dancer_dusk_curtain_t2b` | Dusk Shift | Casting it Veilswaps you to your newest Shadow first and drops the curtain there. |
| 32 | `shadow_dancer_dusk_curtain_t3a` | Cleansing Dark | Removes one movement-impairing effect from each ally inside on cast. |
| 32 | `shadow_dancer_dusk_curtain_t3b` | Swallowed Light | Void-zone damage to allies inside is halved. |
| 45 | `shadow_dancer_dusk_curtain_t4a` | Lights Up | When the curtain ends, every Shadow echoes a free Pirouette Cut. |
| 45 | `shadow_dancer_dusk_curtain_t4b` | Endless Night | 30 s cooldown, 4 s duration. |

### Mirror Waltz
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `shadow_dancer_mirror_waltz_t1a` | Duet | Single-target: all 6 hits on your target, 100% each. |
| 12 | `shadow_dancer_mirror_waltz_t1b` | Grand Ball | Range 16 m, 8 hits of 65%. |
| 22 | `shadow_dancer_mirror_waltz_t2a` | Partners Swap | Each hit adds a Dance stack. |
| 22 | `shadow_dancer_mirror_waltz_t2b` | Trailing Shadows | Leaves a Shadow at every other hit spot (up to cap). |
| 32 | `shadow_dancer_mirror_waltz_t3a` | Controlled Step | You steer: the next target is the enemy nearest your crosshair. |
| 32 | `shadow_dancer_mirror_waltz_t3b` | Untouchable | 100% dodge during the channel (not void zones). |
| 45 | `shadow_dancer_mirror_waltz_t4a` | Masquerade | Shadows waltz separately on their own targets (full 6 hits each at 35%). |
| 45 | `shadow_dancer_mirror_waltz_t4b` | Final Figure | The last hit is 300% and resets Silhouette Strike. |

### Last Bow
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `shadow_dancer_last_bow_t1a` | Early Curtain | Execute threshold 35%. |
| 12 | `shadow_dancer_last_bow_t1b` | Keep Your Shadows | Shadows are not spent (their strikes are 100% each instead). |
| 22 | `shadow_dancer_last_bow_t2a` | Bouquet | A kill also refunds all Focus. |
| 22 | `shadow_dancer_last_bow_t2b` | Bow Out | After the bow you Veilswap to your oldest Shadow's former spot and are Veiled 3 s. |
| 32 | `shadow_dancer_last_bow_t3a` | Encore Bow | A kill lets you cast Last Bow once more within 5 s on a different target. |
| 32 | `shadow_dancer_last_bow_t3b` | Solo Act | With no Shadows, 500% instead of 400%. |
| 45 | `shadow_dancer_last_bow_t4a` | Troupe Leader | Troupe works with 2 Shadows. |
| 45 | `shadow_dancer_last_bow_t4b` | Final Curtain | Against bosses below 10%: 900% weapon, 90 s cooldown for that use. |

---

## 6. Rotation / how it plays

- **Solo:** Backstep Veil into a pack (Forward Veil talent) → Pirouette Cuts with the Shadow echoing → Silhouette Strike flanked → Veilswap out of big hits. Last Bow picks off the champion.
- **Dungeon:** park a Shadow on the far side of the boss at pull (Backstep through, swap back). Keep Silhouette on cooldown flanked; Mirror Waltz on every pack. Dusk Curtain when a void zone or add wave lands on the group.
- **Raid:** the class rewards positioning: your 2–3 Shadows around the boss's back arc = constant flanks. Veilswap is a free dodge through telegraphs every 3 s. Save Last Bow + Troupe for the last 30%.

## 7. Boss mechanics

| Mechanic | Shadow Dancer answer |
|---|---|
| Danger zones (red) | Veilswap out — pre-place a Shadow on the safe side. 0.25 s i-frames. |
| Void zones | Shadows can stand in void zones and keep echoing (they take no damage). |
| Soaks | Your Shadow does **not** count as a player for soaks. |
| Targeted (yellow) circles | Backstep Veil away from the group; Veilswap back after it lands. |
| Tethers | Veilswap breaks a distance tether instantly if the Shadow is far enough. |
| Interrupts | Sever Sight talent. |
| Positional immunity (boss must be hit from front) | Silhouette's flank does not care about the boss's facing — only the Shadow line. |
| Adds | Mirror Waltz, Decoy talent to hold them off the healer for 2 s. |

---

## 8. Class sets

### `set_shadow_dancer_masquerade_silks` — Masquerade Silks (levels 22–30)
Drops: `d06_sandsworn_vault`, `d07_thornheart`, `d08_moonwell_ruins` bosses (Normal), 12% per boss; complete on Heroic.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Echoes are 40% instead of 35%. | Shadows |
| 4 | Backstep Veil leaves 2 Shadows (one at take-off, one halfway). | `shadow_dancer_backstep_veil` |
| 6 | Silhouette Strike from Veiled resets Dusk Curtain's cooldown (once per 90 s). | `shadow_dancer_silhouette_strike`, `shadow_dancer_dusk_curtain` |

### `set_shadow_dancer_choir_of_the_unlit` — Choir of the Unlit (level 50)
Drops: `r03_sunken_choir` bosses (Normal/Mythic), token system.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Pirouette Cut costs 20 Focus. | `shadow_dancer_pirouette_cut` |
| 4 | Mirror Waltz leaves a Shadow at every hit spot. | `shadow_dancer_mirror_waltz` |
| 6 | Dance stacks go to 8 (each +4% damage). | Dance |

### `set_shadow_dancer_veilwoven_garb` — Veilwoven Garb (level 60)
Drops: `r05_veilspire` bosses, Mythic 20-player only for the 6th piece.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Veilswap cooldown 2 s. | Veilswap |
| 4 | Last Bow's Shadow strikes each leave a 3 m void of shadow on the target spot (enemy-only, 30% weapon/0.5 s, 3 s). | `shadow_dancer_last_bow` |
| 6 | You may hold 4 Shadows. | Shadows |

---

## 9. Legendaries and uniques

| id | Name | Slot | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_twin_of_the_moonwell` | Twin of the Moonwell | dagger (main) | Your newest Shadow **attacks on its own** with your basic attacks at 35% (not only spells). | `b_oruvel_moon_drinker` Oruvel, That Which Drank the Moon (`d08_moonwell_ruins` end boss), Heroic/Mythic+ (4%) |
| `leg_curtainfall_slippers` | Curtainfall Slippers | feet | Every Veilswap leaves a 3 m patch of dusk for 3 s (Dusk Curtain's dodge, no stealth). | `b_the_unsung` The Unsung (`r03_sunken_choir` secret boss) |
| `leg_the_understudy` | The Understudy | dagger (off hand) | If you would die, you swap with your newest Shadow instead and it dies in your place (you keep 1 HP; 180 s cooldown). | `b_castellan_brandt` Lord Castellan Aurel Brandt (`r04_ember_court` boss 5), Mythic 6% |
| `leg_lantern_eaters_mask` | Lantern-Eater's Mask | head | While at night (page 00 §4 day cycle) or in a dark room, Shadows echo at 60%. | `b_hungering_brood` The Hungering Brood (Whisperwood world boss), weekly 6% |
| `uq_nettle_waltz` | Nettle Waltz | dagger | Pirouette Cut hits apply Poisoned (50% weapon over 6 s). | `b_wren_grist` Wren Grist, the Miller's Wife (`d02_drowned_mill` main boss 2), Normal |
| `uq_dusk_silk_sash` | Dusk-Silk Sash | waist | Dusk Curtain +2 s; Veiled lasts 12 s. | `b_king_sethar_unshattered` King Sethar the Unshattered (`d05_glass_tombs` end boss) |
| `uq_pinwheel_blades` | Pinwheel Blades | dagger pair (one item fills both hands) | Mirror Waltz hits +2 targets per hop (3 m splash). | `b_warmaster_drogath` Warmaster Drogath Ashmane (`d09_warmasters_pit` end boss) |

---

## 10. Voice and barks

- Timbre: `voiceFor({ role: 'rogue', gender, seed })`, breathy (breath 0.4), light, quick word gap. Lines are often whispered (volume −4 dB). `(reuse: shared/voices.js)`

| Event | Lines |
|---|---|
| Leave a Shadow | "Keep my place." · "Wait here." |
| Veilswap | "Over here." · "Wrong one." |
| Flanked strike | "Look behind you." · "Between us." |
| Last Bow kill | "Thank you, you've been lovely." · "And… scene." |
| Crit | "Too slow." |
| Low health | "The music's stopping — help!" · "I'm fading!" |
| Out of Focus | "Need a breath." |

---

## 11. Reuse notes

| Wildmarch piece | Borrowed from | Notes |
|---|---|---|
| Shadows | Chibi 2 actor cloned with a translucent violet material (`avatar-3d/js/chibi2.js`) | a pose copy, no AI |
| Backstep / Last Bow teleport | Farhold `shadowstep` dash | visuals |
| Dusk Curtain | Farhold `smoke` + spellfx `shadow` ground disc | now a group circle |
| Mirror Waltz | Farhold `whirlwind` repeat engine (`repeats`) | moving version |
| Outfit | no `shadow_dancer` row in `class-outfits.json` yet — **add one** (silks, half cape, knife rig, slippers) from Farhold `data/classes.json` `shadow_dancer.look` | See QUESTIONS.md G4 |
| Emberveil ideas | `sd_shadow_strike`, `smoke_veil`, `assassinate`, `dance_of_blades` | reborn as Silhouette Strike, Dusk Curtain, Last Bow, Mirror Waltz |
