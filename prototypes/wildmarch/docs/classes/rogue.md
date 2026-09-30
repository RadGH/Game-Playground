# Rogue — class design (`rogue`)

> *"Everybody owes. I just collect."*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Follows the class template in
[page 00 §5](../00-OVERVIEW.md). Canon facts used (page 00 §6): primary role **Damage**, hybrid role
**Support**, build **melee or ranged**, **light** armour, resource **Tempo**, mechanic **Blind Spots + Wounds**,
spell slots **1 / 4 / 10 / 18 / 28 / 40**, calling quests **6 / 20 / 40**, talent tiers **12 / 22 / 32 / 45**,
cap **60**.

*(reference)* **Round 2 redesign.** The v0.1 rogue was built on combo points, a stealth mode and an opener from stealth.
All three are gone (§12.1 W29, §12.5). The new system is positional: **where you stand when a hit lands**
decides everything, and it works the same with a dagger at 2 m and a short bow at 30 m.

## How to read the numbers on this page

- **% WD** = percent of one weapon hit. A melee rogue dual-wields; a spell that says "two stabs" uses one hit
  from each hand, and the off hand hits at **60%** (reuse: Farhold `OFFHAND_DAMAGE = 0.60`, `js/weapons.js`) —
  *already included* in the numbers below. Numbers are **final** (Farhold's `effectiveMult` is folded in).
- **Tempo**: pool **100**, refills **25 a second** (full in 4 s; page 05 owns the rule). Every spell costs
  Tempo; nothing builds it except the refill and the refunds named on this page.
- **Melee / Ranged version**: every spell reads the **main-hand weapon**. Dagger or sword → the melee version;
  thrown knives, short bow or hand crossbow → the ranged version. Each spell below has a table with both.
- **Targeting** (page 00 §12.1 W8): **Needs target** will not cast without a valid hard target;
  **Auto-target** uses your hard target, or with none, the valid enemy nearest your aim point in range;
  **Ground** is placed at the aim point; **Self** is centred on you; **Ally** needs a friendly target.
- **Tags** are page 05 §Tags ids. A melee and a ranged version of the same spell can carry different tags
  (`tag_melee` vs `tag_ranged` + `tag_projectile`); a "+10% Ranged damage" bonus only helps the ranged version.
- Statuses (stun, blind, bleed, poison, snare, silence) are page 05's. **Wounded**, **Sapped**, **Numbed** and
  **Laid Open** are the rogue's own (§2; add to page 05 §10.8).

---

## 1. Identity

| Field | Value |
|---|---|
| Fantasy | A knife (or a bolt) from where nobody was looking, and a ledger in its pocket. Everything it hits owes it something. |
| Primary role | **Damage** (burst, single target) |
| Hybrid role | **Support** — weakening poisons and exposed targets for the party (§5) |
| Build | **melee or ranged** — the same six spells with either kind of weapon |
| Armour | light |
| Weapons | **Melee:** two daggers, or dagger + one-handed sword (reuse: `WEAPON_PATTERNS.dagger`, `.sword`). **Ranged:** thrown knives (main hand, with a dagger in the off hand), a short bow (two-handed, a quiver in the off hand), or one or two hand crossbows (reuse: `js/weapons.js` `RANGED`) |
| Primary attribute | DEX (secondary STR) |
| Resource | **Tempo** (0–100) + **Wounds** on each enemy (0–5, 8 from calling 3) |
| Companion | none |
| Starting kit | two daggers **and** a belt of thrown knives in the bag, light chest, light boots (reuse: Farhold `classes.json` `rogue`, `offStarter: dagger`). The player picks which to hold; both are starter-quality |

**Playstyle in three sentences.** Every enemy looks in one direction, shown as a pale wedge on the ground, and
any hit the rogue lands from **outside that wedge** is an **Unseen hit** that cuts a **Wound** into the
target. **Finishers** spend every Wound on the target for a hit that grows with each one, so the rogue's
rhythm is *get to the blind spot, cut, cut, cash in*. A melee rogue gets there by stepping around the
target; a ranged rogue gets there by standing off to the side, climbing onto something high, or firing the
first shot before the enemy has noticed them.

**Original hook:** "200% Backstab on stunned targets. Death Mark makes enemies take 50% more damage from all
sources." — kept as Twin Needles (×2 on a blinded or stunned target) and Deathwarrant (up to +40% from you;
see §3.2 for why it is smaller from everyone else).

---

## 2. Class mechanic — Blind Spots and Wounds (new)

### 2.1 The view cone (every enemy has one)

Every monster has a **view cone**: a wedge in front of it, of a width and length set by its family. Anything
inside the wedge is **seen**; everything outside it is the enemy's **blind spot**. (The cone is a combat
rule for the rogue; it is not the noticing radius that pulls monsters, which page 05 §13.6 owns.)

| Enemy kind (page 10 families) | Cone width | Cone length | Turn rate | Notes |
|---|---|---|---|---|
| Humanoids (bandits, warbands, cultists, guards) | **120°** | 25 m | 360°/s | the baseline |
| Beasts (wolves, cats, boars, bears, raptors) | **110°** | 20 m | 300°/s | |
| Casters (any monster with `role: caster`) | **140°** | 30 m | 240°/s | wider but slow to turn while casting (0°/s during a cast) |
| Undead (skeletons, zombies, the Drowned) | **90°** | 15 m | 240°/s | the easiest blind spots in the game |
| Constructs, golems | **100°** | 20 m | 180°/s | |
| Insects, spiders (many eyes) | **200°** | 12 m | 360°/s | only a 160° rear arc is blind |
| Flyers, birds, bats | **120°** | 25 m | 360°/s | ignore **Elevated** (they look up) |
| All-seeing (oozes, floating eyes, `sees_all` flag) | **360°** | 20 m | — | no blind spot; only **Unnoticed** and **Blinded** make hits Unseen |
| Champion / rare / greater-rarity monster | family +20° | family +5 m | family | still has a blind spot |
| **Bosses** | **150°** (page 12 may set a boss's own value) | 40 m | 90–120°/s (page 11) | see §2.4 |

**Where the cone points.** An enemy's cone follows its body. In a fight the body turns toward **its current
target** (the top of its threat table, page 05 §13) at its turn rate, so a monster being held by a tank looks
at the tank, and everyone else in the party can find a blind spot. A monster that switches to the rogue turns
to face the rogue, and the rogue loses its blind spot until it moves or someone takes the monster back.

**How the player sees it** (new; page 03 `hud_viewcone`, page 04 `set.combat.view_cones`):

- The **hard target's** cone is drawn on the ground as a pale, 20%-opacity wedge (white edge, no fill colour
  that could be mistaken for a telegraph; page 11's colours are never used). Default **on** for rogues, off
  for everyone else; the setting has *Off / Target only / All enemies within 20 m* (the last from calling 1).
- The **target frame** carries an **eye icon**: open = you are seen, closed = you are in its blind spot, closed
  with a star = your next hit is Unseen for another reason (Unnoticed, Elevated, Blinded).
- An Unseen hit shows a small curved red mark on the target and the damage number in dark red.

### 2.2 Unseen hits

A hit is **Unseen** if, **at the moment it lands** (not when it was cast — an arrow fired from the side that
lands after the enemy turned is Seen), **any** of these is true:

| Condition | Rule |
|---|---|
| **Blind spot** | the attacker stands outside the target's view cone (behind, or on the flank past the cone's edge) |
| **Unnoticed** | the target is not yet in combat with you: it has not noticed you and you have not hit it. Only the **first** hit on it can be Unnoticed. From the front and at any range. Once it notices you, the rule stops |
| **Elevated** | you stand at least **3 m above** the target's feet and at least **8 m** from it (a ledge, a roof, a cart, a cliff). Ground-bound enemies do not look up. Flyers and all-seeing enemies ignore this |
| **Blinded** | the target has the **Blinded** status (page 05): it has no cone at all while it lasts |

Unseen hits count for **basic attacks and spells**, melee and ranged. Area hits check each target separately.

### 2.3 Wounds

| Rule | Value |
|---|---|
| Where they live | **on the enemy**, per rogue (two rogues each keep their own count on the same target). Switching target does not lose them; they stay on the old target |
| Opened by | each Unseen hit opens **1 Wound**. Spells may open more (written on the spell). A target gains at most **1 Wound per 1.0 s from basic attacks**; spells are not limited except on bosses (§2.4) |
| Cap | **5** per target (**8** from calling 3) |
| Lifetime | **15 s**, refreshed each time a Wound is added |
| What Wounds do on their own | the target is **Wounded**: it takes **+3% damage from you per Wound** (+15% at 5, +24% at 8). Wounded enemies leave a faint blood trail; nothing else sees the count |
| Finishers | **Open the Ledger** and **Deathwarrant** spend **every** Wound on the target |
| Tempo refund | every spell hit that is Unseen refunds **5 Tempo** (once per cast) |

### 2.4 Bosses

- A boss's cone is wide (150°) but its body faces its current target. **The tank's position makes the blind
  spot for the party**: a tank who holds the boss still and turned away from the group gives every melee and
  ranged damage dealer on the other side an Unseen angle. This is written into page 11's tank guidance.
- **Wound rate cap on bosses: at most 1 Wound per 1.5 s**, from any source (spells included), and a single
  cast can never open more than 2 on a boss. On a champion, rare or greater-rarity monster: 1 per 1.0 s.
  Finisher refunds (talents) ignore the cap.
- A boss that turns to face the rogue (threat, or a scripted turn) takes Seen hits until it turns away. A
  boss's scripted "look around" cast (page 11 may use it) closes every blind spot for its duration.
- Elevated works on bosses unless the boss flies or is flagged `sees_all`.

### 2.5 Calling quests (page 14 owns the text)

| Level | Quest id | Where | Grants |
|---|---|---|---|
| 6 | `q_calling_rogue_1` "Nobody Looks at the Mill" | Brightwater, Hearthvale — recover a stolen ledger from smugglers under the mill by getting behind their lookouts | **Slip Away** (class key `Q`, 90 s cooldown): drop **all** your threat on your hard target and **half** on every other enemy in combat with you; every enemy that was attacking you turns to its next target, which puts you in its blind spot. You stay visible and targetable — it is a threat drop, not a hiding trick. Also: cones of **all enemies within 20 m** can be shown (§2.1), and an **Unnoticed** first hit opens **3 Wounds** instead of 1 |
| 20 | `q_calling_rogue_2` "The Oasis Debt" | Oasis of Tamar, Sunscar — collect three debts from three people who do not want to pay | **Coatings** (`Shift+1`–`3`, §4.2): your Unseen hits apply a poison you choose |
| 40 | `q_calling_rogue_3` "Settling Accounts" | Saltmarch, Drowned Coast — a heist in a drowned counting-house | **Deep Wounds**: the cap is **8**, and Wounds 6–8 count **double** for every finisher (8 Wounds = 11 counted) |

### 2.6 HUD (new; page 03 `hud_wounds`)

- On the **target frame**: the eye icon (§2.1) and a row of **five small red slashes** (eight after calling 3;
  6–8 gold-rimmed = double) showing *your* Wounds on that target, with a thin 15 s timer line under them.
- Next to your own Tempo bar: the **Slip Away** cooldown and, from calling 2, the **coating** icon (§4.2).
- Tooltip: "4 Wounds on the Mire Hound. You deal +12% damage to it. Your next finisher spends all of them.
  They close 15 s after the last one."

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Tempo | Cooldown | Cast | Target | Tags (melee / ranged) | Headline |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `rogue_twin_needles` | Twin Needles | 20 | — | instant | Auto-target | `tag_physical` `tag_attack` + `tag_melee` / `tag_ranged` `tag_projectile` | two quick hits, 110% / 100% WD; ×2 on blinded or stunned |
| 2 | 4 | `rogue_open_the_ledger` | Open the Ledger (finisher) | 30 | — | instant | Needs target | `tag_physical` `tag_attack` `tag_duration` + `tag_melee` / `tag_ranged` `tag_projectile` | 50% + 70% WD per Wound, bleed |
| 3 | 10 | `rogue_blindside` | Blindside | 25 | 14 s | instant | Needs target | `tag_physical` `tag_attack` `tag_movement` + `tag_melee` / `tag_ranged` `tag_projectile` | step into the blind spot (melee) or vault high (ranged); the hit is always Unseen |
| 4 | 18 | `rogue_ashpowder` | Ashpowder | 30 | 30 s | instant | Self / Ground | `tag_physical` `tag_area` `tag_duration` (+ `tag_projectile` ranged) | 6 m cloud: blind 4 s (no cone), interrupts, −50% your threat |
| 5 | 28 | `rogue_knife_tumble` | Knife Tumble | 15 | 12 s | instant | Self | `tag_physical` `tag_attack` `tag_movement` + `tag_melee` / `tag_ranged` `tag_projectile` | 8 m roll, 0.4 s immune; enemies lose track of you |
| 6 | 40 | `rogue_deathwarrant` | Deathwarrant (finisher) | 35 | 60 s | instant | Needs target | `tag_physical` `tag_curse` `tag_duration` + `tag_melee` / `tag_ranged` | +8% from you per Wound for 8 s, then the bill |

### 3.2 Spell details

**1. `rogue_twin_needles` — Twin Needles** (level 1) — the builder
- **20 Tempo**, no cooldown (only the 1.0 s global cooldown). Single target.
- Targeting: **Auto-target**. Tags: `tag_physical`, `tag_attack`, plus `tag_melee` (melee) or `tag_ranged`
  `tag_projectile` (ranged).
- Each of the two hits is checked for Unseen on its own, so one cast can open **2 Wounds** (1 on a boss).
- Against a **blinded or stunned** target: **×2** damage.

| | Melee (dagger / sword) | Ranged (thrown knives / short bow / hand crossbow) |
|---|---|---|
| Range | 2.2 m | knives 20 m · short bow 30 m · hand crossbow 25 m |
| Shape | two stabs, one per hand | two shots 0.15 s apart |
| Damage | 70% + 40% (off hand) = **110% WD** | 2 × **50% WD** = **100% WD** |
| Extra | dagger: the first stab from the rear 100° also gets the dagger's backstab trait (page 05 §4.1) | two hand crossbows: one bolt from each; a short bow draws once and looses two arrows |

- Looks: melee Chibi 2 `offThrust` then `stab`, two thin `slash` sprites; ranged `throw` ×2 or `bowShot`,
  two `streak` projectiles. `spark` on hit, a red curved mark on an Unseen hit.
- Sound: `melee.swing` ×2 / `spell.physical.launch` ×2, `melee.hit` ×2.

**2. `rogue_open_the_ledger` — Open the Ledger** (level 4) — finisher
- **30 Tempo**, no cooldown. Needs **1+ Wound** on the target.
- Targeting: **Needs target**. Tags: `tag_physical`, `tag_attack`, `tag_duration`, plus melee or ranged tags.
- Damage **50% WD + 70% WD per Wound spent** (5 Wounds = 400%; 8 at level 40 = 11 counted = 820%).
- **Bleed** for **2 s per Wound** at **15% WD a second** (page 05 bleed; refreshes, does not stack with itself).
- The finisher itself can be Unseen; if it is, it opens 1 new Wound *after* spending the old ones.

| | Melee | Ranged |
|---|---|---|
| Range | 2.2 m | knives 20 m · bow 30 m · crossbow 25 m |
| Shape | a crossing slash | one heavy shot (a bow draws 0.3 s longer; a crossbow bolt pierces 1 more enemy in line at 40%) |
| Damage | as above | **45% + 63% WD per Wound** (90%) |

- Looks: Chibi 2 `crossSlash` or a held-draw shot; a red `slash` X on the target, `bleed` drops.
- Sound: `melee.crit` (always the heavy variant) + `status.bleed.apply`; a coin clink per Wound spent.

**3. `rogue_blindside` — Blindside** (level 10) — gets you into position
- **25 Tempo**, cooldown **14 s**.
- Targeting: **Needs target**. Tags: `tag_physical`, `tag_attack`, `tag_movement`, plus melee or ranged tags.
- The hit that ends it is **always Unseen**, whatever the target's facing, and opens **2 Wounds** (1 on a boss).

| | Melee | Ranged |
|---|---|---|
| Movement | **dash** along the ground to the point 1.5 m directly **behind** the target, up to **12 m** away (paths around small obstacles; fails with a message if there is no ground there) | **vault**: a back-flip up to **8 m** away from the target, landing **Elevated** for 4 s — you count as 3 m above everything within 25 m for the Elevated rule (a rope-and-hook leap; it does not need a real ledge) |
| Hit | **150% WD** stab at the end of the dash | one shot at the top of the vault, **135% WD** |
| Extra | the target is **snared 30% for 2 s** | while the vault's Elevated lasts, flyers and all-seeing enemies still see you |

- Looks: melee a low blur (`streak` sprites, element `physical`) and Chibi 2 `stab` from behind; ranged a
  `jump` clip with a rope `streak` and the shot at the peak.
- Sound: cloth snap + `melee.crit` / `spell.physical.launch`.

**4. `rogue_ashpowder` — Ashpowder** (level 18)
- **30 Tempo**, cooldown **30 s**, instant. A **6 m circle** cloud lasting **6 s**.
- Targeting: melee **Self** (bursts on you); ranged **Ground** (a thrown flask, placed at the aim point within
  **25 m**). Tags: `tag_physical`, `tag_area`, `tag_duration`; the ranged version adds `tag_projectile`.
- Enemies inside when it bursts are **Blinded 4 s** (page 05: they miss 50% of attacks) and **have no view
  cone** while blinded, so every hit on them from anyone is Unseen for the rogue. Anything that was casting is
  **interrupted**. Your threat on every enemy inside drops **50%**.
- You and allies inside the cloud get **+30% dodge chance** while inside.
- Looks: a grey-orange `smoke` + `puff` cloud (normal blending so it reads in daylight), `STATUS_FX.blind` on
  enemies.
- Sound: a soft thump + hiss (`steam.hiss`), `status.blind.apply`; the flask adds a glass `fragment.crash.small`.

**5. `rogue_knife_tumble` — Knife Tumble** (level 28) — the movement tool
- **15 Tempo**, cooldown **12 s**, instant. Roll **8 m** in the direction you are moving (backward if standing).
- Targeting: **Self**. Tags: `tag_physical`, `tag_attack`, `tag_movement`, plus melee or ranged tags.
- **Immune to all damage for 0.4 s** of the roll (you can roll *through* a danger zone's filling edge or a void
  zone).
- **Lose track**: every enemy the tumble hits **loses track of you for 1.5 s** — your next hit on each of them
  is Unseen whatever its facing (bosses: 0.75 s).

| | Melee | Ranged |
|---|---|---|
| Hits | **80% WD** to every enemy you roll **through** | at the end of the roll, one knife / arrow / bolt at each of the **3 enemies nearest** you within your range, **70% WD** each |
| Wounds | the lose-track hit is the *next* one; the tumble's own hits are checked normally | same |

- Looks: new Chibi 2 clip `roll` (see reuse notes), `streak` sprites, blades flashing (`slash`) at each enemy
  passed / three `streak` projectiles fanning out.
- Sound: cloth whoosh (`travel.step.soft` ×2) + `melee.hit` or `spell.physical.launch` ×3.

**6. `rogue_deathwarrant` — Deathwarrant** (level 40) — finisher
- **35 Tempo**, cooldown **60 s**, single target, needs **1+ Wound**. Lasts **8 s**.
- Targeting: **Needs target**. Range: melee 2.2 m; ranged as the weapon (20 / 30 / 25 m). Tags:
  `tag_physical`, `tag_curse`, `tag_duration`, plus `tag_melee` or `tag_ranged`.
- The target takes **+8% damage from you per Wound** spent (5 = +40%; 8 Wounds at 40+ = 11 counted = +88%) and
  **+3% from everyone else per Wound** (+15% at 5).
- **The bill**: when the warrant ends, the target takes **25% of all the damage you dealt it during the
  warrant** again, as one hit (Unseen if you are in its blind spot then).
- *(design note)* The original "+50% from all sources" would make a rogue mandatory in every group; the
  everyone-else share is kept small so a rogue is welcome, not required. The support build raises it (§5).
- Looks: a black-and-red `rune_ring` stamped under the target, a floating wax-seal `skull` sprite above it
  (`STATUS_FX.curse` style but red), a big `slash` when the bill lands.
- Sound: `status.marked.apply` + a quill scratch (new), `melee.crit` + coins falling for the bill (`loot.rare`).

### 3.3 Rotation / how it plays

- **Solo, melee:** walk in from the side; the first hit is Unnoticed (3 Wounds from calling 1) → Blindside
  behind it (+2) → Open the Ledger at 5. On a pack: Ashpowder (everything blinded = every hit Unseen), then
  Needles and Ledger through the cloud. Knife Tumble to get out, or through a pack so each one loses track.
- **Solo, ranged:** open from a ledge or a cart (Elevated) or before it notices you; Blindside's vault when it
  closes in; thrown Ashpowder on the pack that reaches you; Knife Tumble away and the three-shot fan.
- **Dungeon, Normal:** stand where the tank has turned the boss away. Needles on cooldown of Tempo, Ledger at
  5 Wounds (the bleed keeps rolling), Deathwarrant on cooldown with 5+. Ashpowder a pack of casters. Slip Away
  if a monster peels off the tank onto you.
- **Challenge / deep Depth:** the Wound rate cap (1 per 1.5 s) means about 6–7 s per full count; Deathwarrant
  is saved for the boss's burn phase (page 11) with 8 Wounds. Knife Tumble and Ashpowder are for the mechanics.

### 3.4 Boss mechanics

| Mechanic (page 11) | Rogue |
|---|---|
| Void / danger zones | **Knife Tumble** (0.4 s immunity, 8 m) — roll through, not around. Plus the dodge roll. |
| Frontal cones / cleaves | The rogue lives in the boss's blind spot, so it is rarely in the cone. When a boss turns (a scripted spin, a threat swap) the cone *and* the cleave follow it — the eye icon closing is the rogue's warning too. |
| Soak (orange) | Counts as one soaker; light armour. Timing Knife Tumble so its 0.4 s immunity covers the landing is a skill trick — proposed rule: an immune player still counts toward the pips and takes nothing (page 11 owns it). |
| Aggro | **Slip Away** (`Q`, 90 s) drops all threat on the target; Ashpowder drops 50% on everything inside. |
| Interrupts | Ashpowder interrupts every caster in 6 m (30 s). Talents add a 10 s interrupt (**Pommel Jab**) and a silence (**Choke Wire**). |
| Adds | Ashpowder blinds them; Blindside reaches a caster 12 m away (melee) or vaults out of a melee add's reach (ranged). |
| Buffs on the boss | Tier-3 **Pickpocket** (Blindside) steals one buff. |
| Stuns | Bosses are stun-immune (page 05 §11.4), so the ×2-on-stunned half of Twin Needles is for adds; **Blinded** works on bosses only if page 11 lets it (most bosses: blind fills the break bar instead). |

---

## 4. Alternate spells

### 4.1 Weapon families

Every spell has a melee and a ranged version (§3.2). On top of that, the main-hand weapon family adds one
rider to the whole kit:

| Main hand | Range of the ranged versions | Rider |
|---|---|---|
| Dagger | — (melee) | basic attacks from the rear 100° keep the dagger backstab trait (page 05 §4.1) |
| One-handed sword | — (melee) | Twin Needles' second hit is an arc that also hits one more enemy within 2.5 m at 50% |
| Thrown knives | 20 m | fastest: Twin Needles costs **15** Tempo; knives are recovered automatically (no ammunition) |
| Short bow | 30 m | longest; the bow's quiver (off hand) effects apply to Twin Needles (it is **not** tagged `tag_basic_attack`, so quiver *effects* do not fire — only the quiver's stats count) |
| Hand crossbow (one or two) | 25 m | every bolt from a spell pierces **1** extra enemy in a line at 40% (the pierce is checked for Unseen separately) |

Weapon swapping in combat follows page 08's rule; a rogue commits to a kit per fight, the Second Loadout
(page 07) keeps one of each.

### 4.2 Coatings (calling 2)

`Shift+1`–`3` pick a **coating**; one is active at a time, out of combat or in (1.0 s global cooldown). A
coating is applied by **Unseen hits only** (basic attacks and spells, melee and ranged).

| Key | Coating | Status (page 05) | Effect | Tags gained |
|---|---|---|---|---|
| `Shift+1` | **Rot** | poison | **12% WD a second for 6 s**, stacks to 3 | `tag_poison` |
| `Shift+2` | **Sap** | **Sapped** | the target deals **−4% damage per stack**, 8 s, stacks to 3 (−12%); on a boss half (−6%) | `tag_poison`, `tag_curse` |
| `Shift+3` | **Numbing** | **Numbed** | the target casts **20% slower** and an interrupt on it locks the school **+2 s** longer, 8 s; on a boss the cast slow is 10% | `tag_poison`, `tag_curse` |

Rot is the damage choice; Sap and Numbing are the support choices (§5).

---

## 5. The hybrid role — Support

**How.** A support rogue plays the same six spells with **Sap or Numbing** coated (§4.2) and the support
talents below. It uses the canon **Role focus** switch (00 §6; spellbook, out of combat, saved per Loadout): set to
**Hybrid (Support)**, the Dungeon Finder queues it as **Support** (which counts as a Damage slot, page 00 §4); nothing
else about the spells changes — the coating and talents do the work.
Its job: keep the boss **Sapped** (−12% to everyone it hits) or **Numbed**, keep packs **Blinded**, and turn
Deathwarrant into a party-wide damage window.

**Support talents** (§7): Twin Needles **Venom Needles** (t2b, coats with every hit, not only Unseen ones —
the Sap stays up on a boss that faces you), Ashpowder **Wide Powder** (t1c) and **Deep Ash** (t2c),
Deathwarrant **Wanted Poster** (t2c: +5% from everyone per Wound) and **Laid Open** (Open the Ledger t3a:
the target takes +8% from your party for 6 s).

**Gear:** `uq_sealed_writ`, the set `set_rogue_long_count` 4-piece (Coatings apply one extra stack),
`soul_turned_head` (§9).

**How well it does, in numbers.**

| Content | Support value | Own damage | Why |
|---|---|---|---|
| Open world, Normal dungeons | pack enemies deal **−12%** (Sap, full value on non-bosses); Deathwarrant gives the party **+25%** for 8 s every 60 s; Ashpowder blinds (50% misses) every 30 s | **~75%** of a damage rogue | Normal packs die before Sap matters less than blind; most of the value is on trash |
| Depth up to about 10 | as above; packs grow, so Ashpowder hits more bodies | ~75% | still strong |
| Challenge mode | **−6%** Sap on bosses, Numbing's slow halved, and **Challenge bosses' big casts are grey (uninterruptible, page 11)**, so Numbing's extra lockout has nothing to lock | ~75% | the weakening poisons are halved on every boss by this page's rule, and Challenge is mostly bosses. A dedicated Support class does more there. Accepted (page 00 §6) |

---

## 6. Utility spells

None. The rogue travels with scrolls and the Recall Stone (page 20). (Opening locked chests is a Harvesting
action for everyone, page 19.)

---

## 7. Talents

Id = spell id + `_t<tier><letter>`. A tier opens at its level or when the spell unlocks, whichever is later.
Unless a talent says "melee" or "ranged", it changes both versions.

### Twin Needles
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Flurry** — four hits of 35% WD (melee: two per hand; ranged: four quick shots, 30% each). | **Side Step** — each cast shifts you 1.5 m around the target toward its nearest blind edge (ranged: 3 m sideways). Adds `tag_movement`. | **Hamstring** — the second hit snares 40% for 4 s. |
| 2 (22) | **Pommel Jab** — a third hit (30% WD) that **interrupts**, at most once per 10 s (ranged: a blunt bolt). | **Venom Needles** — each hit applies your coating even when Seen (support). | **Opportunist** — a snared or rooted target counts as Blinded for the Unseen rule. |
| 3 (32) | **Quick Hands** — every 3rd cast refunds 20 Tempo. | **Deep Cut** — an Unseen cast on a target with 3+ Wounds opens 1 extra. | **Harrying** — each Seen hit turns the target 20° away from you (non-boss). |
| 4 (45) | **Stitching** — hold the key: a hit every 0.15 s for 1.2 s (8 × 40% WD), each checked for Unseen. | **Needle Rain** — each cast also sends a needle at the 2 nearest other enemies for 40% WD. Adds `tag_area`. | — |

### Open the Ledger
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Settle Up** — no bleed; +30% damage on the hit instead. | **Compound Interest** — bleed 3 s per Wound; each tick hits 10% harder than the last. | **Open Book** — hits every enemy in a 3 m, 80° cone (melee) or a 1.5 m line to 30 m (ranged) at 60%; each spends its own Wounds. Adds `tag_area`. |
| 2 (22) | **Paid in Full** — a kill reopens 3 Wounds on the nearest enemy within 10 m. | **Lien** — when the target dies, its bleed jumps to the nearest enemy. | **Commission** — heals you 2% max health per Wound. Adds `tag_heal`. |
| 3 (32) | **Laid Open** — the target is **Laid Open** 6 s: it takes +8% damage from your party (support). | **Kidney Note** — at 5+ Wounds, stun 1 s (boss: nothing). | **Double Entry** — each Wound has a 20% chance not to be spent. |
| 4 (45) | **Foreclosure** — ×2 on a target under 30% health. | **Audit** — the target is **Audited** 6 s: your next Deathwarrant on it counts as 5 Wounds without spending any. | — |

### Blindside
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Choke Wire** — **silence** 3 s instead of the snare (works on bosses as an interrupt). | **Low Blow** — stun 2 s (non-boss), damage 110%. | **Long Reach** — melee dash 20 m; ranged vault 12 m. |
| 2 (22) | **Out of Sight** — after Blindside, the target cannot attack you for 1.5 s (it turns to its next threat target). | **Bloodfall** — applies 3 stacked bleeds. | **Double Back** — press again within 3 s to return to where you started. |
| 3 (32) | **Pickpocket** — steals gold (open world) and one buff from the target (it moves to you for its remaining time, or is simply removed). | **High Ground** — ranged: the vault's Elevated lasts 8 s; melee: the dash ends with you Elevated for 2 s if the target is shorter than you. | **Full Purse** — opens 3 Wounds (1 on a boss, the cap still applies). |
| 4 (45) | **Clean Exit** — if the target dies within 5 s, Blindside's cooldown resets. | **Twin Blind** — also hits (and snares) one more enemy within 6 m. | — |

### Ashpowder
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Long Throw** — melee version can also be thrown to 20 m (it becomes Ground). | **Choking Powder** — also silences 2 s. | **Wide Powder** — 10 m circle (support). |
| 2 (22) | **Smoke Screen** — while inside, you and allies are ignored by enemies outside the cloud (they pick other targets). | **Shared Cover** — allies inside also drop 50% threat. | **Deep Ash** — blind 6 s (support). |
| 3 (32) | **Smoke Wall** — enemy projectiles stop at the cloud's edge. | **Cinder Ash** — the cloud burns: 20% WD a second. Adds `tag_fire`. | **Two Pouches** — 2 charges. |
| 4 (45) | **Inside the Cloud** — every enemy inside counts as Blinded for 2 s after it leaves. | **Clinging Dust** — the cloud follows you. | — |

### Knife Tumble
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Double Tumble** — 2 charges. | **Back Tumble** — always rolls away from where you face. | **Long Tumble** — 12 m. |
| 2 (22)\* | **Caltrop Trail** — leaves blades on the path for 4 s (bleed). Adds `tag_trap`. | **Slip Free** — breaks roots and snares. | **Lost Trail** — the lose-track window is 3 s (bosses 1.5 s). |
| 3 (32) | **Behind You** — melee: ends behind the first enemy passed, facing its back; ranged: ends on the far side of the nearest enemy's blind edge. | **Second Breath** — each enemy hit restores 10 Tempo. | **Crossing Knives** — melee also throws a knife at every enemy passed for 60% WD; ranged fans at 5 enemies. |
| 4 (45) | **Endless Tumble** — a kill within 3 s resets it. | **Untouchable** — the immunity lasts 1 s. | — |

\* unlocks at 28: tiers 1–2 open together.

### Deathwarrant
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Open Warrant** — needs no Wounds: counts as 5 but lasts 5 s. | **Two Warrants** — two targets, each at half value. | **Signed in Blood** — also bleeds for the full 8 s. |
| 2 (22)\* | **Bounty** — a kill under the warrant restores 50 Tempo and opens 5 Wounds on the nearest enemy. | **Hunted** — the target cannot turn invisible and is slowed 20%; its cone narrows by 40° for the duration. | **Wanted Poster** — everyone else's share is +5% per Wound, not +3% (support). |
| 3 (32)\* | **Final Notice** — the bill is 40%. | **Pass It On** — if the target dies, the warrant moves to the nearest enemy with its remaining time. | **Serve Papers** — the melee version can be cast from 25 m. |
| 4 (45) | **Executioner's Due** — if the target is under 20% health when it ends: executed (non-boss) or a 200% WD bill on top (boss). | **Standing Warrant** — lasts 12 s. | — |

\* unlocks at 40: tiers 1–3 open together.

---

## 8. Class sets

### `set_rogue_ledgerkeeper` — The Ledgerkeeper's Leathers (levelling-to-60 set)
Head `d06_sandsworn_vault` final boss, chest `d11_saltdeep_cathedral` final boss, legs `d09_warmasters_pit`
boss 2, hands `d12_unmade_workshop` boss 3, feet `d10_rimefang_caverns` final boss, necklace
(`it_ledgerkeeper_seal`) `d13_cindergate` final boss. On **Normal** a piece drops at the dungeon's level; on
**Challenge** at 60.
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | An Unseen Twin Needles opens **+1** Wound (bosses: still capped). | Twin Needles |
| 4 | Open the Ledger's bleed makes the target take +5% from your Twin Needles per Wound it was cast with. | Open the Ledger, Twin Needles |
| 6 | Every finisher has a 10% chance per Wound spent to give **Slip Away** its cooldown back. | Slip Away, finishers |

### `set_rogue_long_count` — The Long Count (endgame set)
Was a raid set; raids are in `WISHLIST.md`. New source: **one piece from each Challenge-mode boss of
`d15_fire_court` and `d16_the_spire`** (page 12 picks which boss holds which slot), plus an **8% rogue-only
roll** on the end chest of any dungeon at **Depth 10+**. Item level 60.
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Blindside's cooldown is 10 s. | Blindside |
| 4 | Coatings apply one extra stack per Unseen hit; Knife Tumble's lose-track window is +1 s. | Coatings, Knife Tumble |
| 6 | Deathwarrant's bill is paid **twice**: at the end and again 3 s later. | Deathwarrant |

---

## 9. Class legendaries, uniques and souls

### Legendaries
| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_the_debt_collector` | The Debt Collector | dagger | **Collected** — every finisher adds 10% of its damage to a store; Deathwarrant's bill adds the whole store. | `d15_fire_court` boss 3, **Challenge** |
| `leg_twinfang` | Twinfang | dagger (paired: one drop gives both halves) | **Mirrored** — Twin Needles' off-hand stab deals 100% instead of 40%, and an Unseen cast opens both its Wounds even on a boss. | `d11_saltdeep_cathedral` final boss on **Challenge**, or its end chest at **Depth 5+** |
| `leg_cloak_of_the_unwatched` | Cloak of the Unwatched | light chest | **Unwatched** — every enemy's cone is **30° narrower** against you, and Slip Away's cooldown is 45 s. | the world boss of `drowned_coast` (page 13) |
| `leg_ashen_tallybag` | The Ashen Tally-Bag | light legs | **Ash Ledger** — every enemy blinded by Ashpowder gets 1 Wound (ignores the boss rate cap). | the world boss of `frostmantle` (page 13) |
| `leg_high_perch` | The High Perch | hand crossbow | **Perched** — Elevated needs only **1.5 m** of height, and an Elevated spell hit opens 2 Wounds (1 on a boss). | end chest of any dungeon at **Depth 15+** (rogue-only roll) |

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_mill_rats_knuckles` | Mill-Rat Knuckles | light hands | Twin Needles against a snared or rooted target opens +1 Wound. | `d02_drowned_mill` final boss |
| `uq_tumblers_anklets` | Tumbler's Anklets | light feet | Knife Tumble's immunity lasts 0.6 s and it goes 10 m. | `d05_glass_tombs` boss 2 |
| `uq_sealed_writ` | The Sealed Writ | ring | Deathwarrant lasts 10 s; everyone else's share is +4% per Wound. | `d14_ashen_reliquary` boss 2 |
| `uq_longshot_string` | Longshot String | short bow | Unnoticed first shots reach 45 m and open 4 Wounds (with calling 1). | `d07_thornheart` final boss |

### Souls (new)
Soul socket rules: page 08. Requirement: **class Rogue**.

| id | Name | Socket | Effect | Source |
|---|---|---|---|---|
| `soul_turned_head` | The Turned Head | weapon | An Unseen hit has a **15% chance** to make the target **turn 90° away** from you for 1.5 s (non-boss); on a boss it instead makes your next hit Unseen whatever its facing (once per 10 s). Party members get the turned blind spot too. | `d12_unmade_workshop` final boss, 3% on Normal / 8% on Challenge |
| `soul_carried_tally` | The Carried Tally | jewellery (ring or neck) | When a Wounded enemy dies, **half its Wounds** (rounded down) move to the nearest enemy within 10 m (bosses: the rate cap applies). | the world boss of `sunscar` (page 13), 5% per kill once a week |

---

## 10. Voice and barks

- Timbre: `shared/voices.js` role `rogue` (pitch 0.55, breath 0.35, speed 0.60 — quick and breathy).
- Lingo tag `class:rogue`.

| Moment | Lines |
|---|---|
| First Unnoticed hit | "Surprise." · "Didn't see me?" |
| Blindside | "Behind you." · "Over here." |
| Twin Needles, Unseen | (a small laugh) |
| Open the Ledger | "Paid." · "Settled." |
| Deathwarrant | "Your name's on the list." · "Time to pay." |
| The bill lands | "Interest." |
| Ashpowder | "Can't see me." |
| Slip Away | "Not me. Him." |
| Critical hit | "Right between." |
| Low health | "Getting hot—" · "Need an exit!" |

---

## 11. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Dagger rhythm, backstab arc, off-hand 60% | `prototypes/farhold/js/weapons.js` `WEAPON_PATTERNS.dagger`, `WEAPON_TRAITS.dagger`, `OFFHAND_DAMAGE` | melee basic attacks |
| Thrown / bow / crossbow timing, draw | `prototypes/farhold/js/weapons.js` `RANGED`, `drawPower` | ranged versions |
| Facing and yaw for the view cone | `prototypes/farhold/js/actors.js` (enemy yaw, `aimOf`) | cone direction (new rule on top) |
| Timbre `rogue` | `shared/voices.js` | voice |
| Look (hood, strapped leather, knife rig, `fh_daggers` + `fh_dagger`) | `avatar-3d/data/class-outfits.json` `classes.rogue` | default outfit |
| Clips `stab`, `offThrust`, `crossSlash`, `flurry`, `jump`, `throw` | `avatar-3d/js/chibi2-motion.js` | spells; a new `roll` clip is needed for Knife Tumble (and is useful for everyone's dodge roll — page 17) |
| Visual ideas of Farhold `eviscerate`, `shadowstep`, `smoke`, `execute` | `prototypes/farhold/data/skills.json` | effects only — ids/names/numbers new |
| `STATUS_FX.stun`, `.blind`, `.bleed`, `.curse`, `.poison`; `smoke` sprites | `avatar-3d/js/spellfx.js`, `assets/data/fx/` | powder, ledger, warrant, coatings |
| `backstab`, `poison_blade`, `death_mark` | `prototypes/emberveil/data/skills.json` (the older prototype, path only) | design ancestry |
| Sound ids | `sfx/data/catalog.json` | as listed; the quill scratch is new |
| Talent engine | `prototypes/farhold/js/skilltalents.js`; new mod keys `wounds`, `unseen`, `finisher`, `coating` | talent cards |
