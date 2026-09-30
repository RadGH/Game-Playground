# Ranger — class design (`ranger`)

> *"I picked her out of the whole valley. She picked me back."*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Follows the class template in
[page 00 §5](../00-OVERVIEW.md#5-the-spell-ladder-and-the-class-template).
Canon facts used (page 00 §6): primary role **Damage**, hybrid role **Support**, build **ranged**, **light**
armour, resource **Tempo**, mechanic **Tame Beast + hunter's marks**, spell slots **1 / 4 / 10 / 18 / 28 / 40**,
calling quests **6 / 20 / 40**, talent tiers **12 / 22 / 32 / 45**, cap **60**.

**Round 2 changes on this page:** the hunting cat that a quest handed you is gone. The ranger now **tames a
wild beast of their own choice** (§2.3–2.6), keeps it for good, and revives it with an out-of-combat ritual
(§6). Focus → **Tempo**. Every spell has a targeting kind and tags. Raid sources are replaced, the old raid set
has a new source, and souls are added (§9).

## How to read the numbers on this page

- **% WD** = percent of one full-power weapon hit (for a bow: a fully drawn shot; page 05 owns the formula).
  A ranger **spell** always fires at full draw — spells do not use the hold-to-draw of basic attacks
  (reuse: `prototypes/farhold/js/weapons.js` `RANGED`, `inputOf`). Numbers are **final**; Farhold's
  `effectiveMult` is already folded in (one multiplier, one owner).
- **Tempo**: pool **100**, refills **25 a second** (a full bar in 4 s; page 05 owns the base rate). Basic
  attacks cost nothing. Ranger-only rule: **every Hunt stack spent refunds 2 Tempo**. Spell costs are listed
  per spell; the ranger's pressure point is firing Barbed Fan (40) and Skyfall Volley (60) close together.
- **BD** = percent of one hit from the ranger's tamed beast (its bite, claw or gore; §2.5).
- **Targeting** (page 00 §12.1 W8): **Needs target** (won't cast without a valid target), **Auto-target**
  (with no valid target it picks the valid enemy nearest your aim point, in range, and makes it your target),
  **Ground**, **Self**, **Ally**.
- **Tags** are page 05's list. Anything the beast does carries `tag_minion`, so "+% minion damage" gear
  helps it and "+% ranged damage" gear does not.
- Statuses (root, snare, bleed, poison, stun, blind, silence, haste, weaken) are page 05's.

---

## 1. Identity

| Field | Value |
|---|---|
| Fantasy | A tracker who walks into the wild, picks one animal out of it, and wins it over. The two of them choose the prey, mark it and run it down together. |
| Primary role | **Damage** (ranged; single target and packs) |
| Hybrid role | **Support** — marks that make a target take more damage from the whole party, traps, a Tracker beast that weakens and reveals, a party haste howl (§5) |
| Build | **ranged** |
| Armour | light |
| Weapons | bow, shortbow, longbow, crossbow, javelin (reuse: `WEAPON_PATTERNS` / `RANGED` rows of the same names). A **quiver** in the off hand — a damage stat-stick that may add an effect to basic attacks only (page 00 §12.3; reuse: `quiverGoesWith`) |
| Primary attribute | DEX (secondary CON) |
| Resource | **Tempo** (0–100, refills 25/s) + **Hunt** stacks on the Quarry |
| Companion | **a tamed beast of the player's choosing** from the level 6 calling (§2.3). Permanent, takes no party slot, revived by the **Rite of Return** (§6) |
| Starting kit | shortbow, light chest, light boots, ring, a plain quiver (reuse: Emberveil `ranger.startingEquipment`) |

**Playstyle in three sentences.** The ranger picks **one enemy as the Quarry** with an arrow, and every hit
on it — the ranger's or the beast's — adds a **Hunt stack**, which the big moves (Command Strike, Skyfall
Volley) spend. What the class *feels* like depends on which beast walks beside it: a wolf or great cat makes
it a pure hunter, a bear or boar lets it hold enemies off its own back, and a hawk, spider or frog turns it
into a controller that helps a party. Between those, it controls space with hidden **snares** and a backward
leap, which makes it the best kiter in the game.

**Original hook:** "Aimed Shot ignores armor. Rain of Arrows blankets the entire enemy field for 3 rounds."
— kept as Quarry Arrow (ignores half the armour, all of it with a talent) and Skyfall Volley.

---

## 2. Class mechanic — the Quarry and the tamed beast (new; creature bodies are reuse)

### 2.1 Quarry and Hunt stacks (level 1)

| Rule | Value |
|---|---|
| Applying | **Quarry Arrow** (and a sprung trap, if nothing is marked) makes its target your **Quarry**. One Quarry at a time (two from calling 20). A new Quarry Arrow on another enemy **moves** the mark and its stacks drop to 0. |
| Duration | 20 s, refreshed by any hit from you or your beast. |
| Bonus | The Quarry takes **+10% damage** from you and your beast (from everyone with the Hunter's Brand talent, §7). |
| Hunt stacks | +1 per hit from you or the beast on the Quarry (Quarry Arrow gives +2). Max **10** (15 from calling 40). Stacks last as long as the mark. |
| Spenders | Command Strike (up to 5 stacks, +20% each), Skyfall Volley (all stacks, +5% each). Each stack spent refunds **2 Tempo**. |
| Visible to others | Yes — party members see a green crosshair over your Quarry, so the tank and healer know what is being hunted. |
| Targeting | The Quarry is not your target. Your hard target (Tab) stays whatever you set; spells that say "your Quarry if you have no target" fall back to it. |

### 2.2 Calling quests (page 14 owns the text; ids per page 00 §10)

| Level | Quest id | Where (page 01 owns) | Grants |
|---|---|---|---|
| 6 | `q_calling_ranger_1` "One From the Valley" | Hearthvale's orchards and hills — an old trapper teaches you to read tracks, then tells you to go and win over **any** wolf, boar or hawk you like | **Tame Beast** (§6.1), the **Rite of Return** (§6.2), **Read the Trail** (§6.3), **beast commands** (§2.6), **3 stable places** (§2.7) |
| 20 | `q_calling_ranger_2` "Two Trails" | Sunscar mesas — hunt a pair of glass-backed stalkers that always move together | **Second Quarry** (two marks, stacks per mark) and **Pincer**: when you and your beast hit the same Quarry within 1 s, a bonus hit of **60% WD** (once per 3 s). **5 stable places** |
| 40 | `q_calling_ranger_3` "The Apex" | Frostmantle glacier — follow a white great-cat for three days without being seen, then face it | **Apex Bond**: max stacks **15**; when a Quarry dies its mark jumps to the nearest enemy within 15 m with **half** its stacks; you can tame **champion-pack** beasts (§2.3); your beast **Refuses to Fall** (§2.5). **7 stable places** |

### 2.3 Which beasts can be tamed

A monster can be tamed only if page 10 marks its family **tameable** (see the canon request in the report).
The families below are the ranger's list. Page 10 owns every monster id; any Normal monster whose id starts
whose row carries `tameable: true` and one of the `tameFamily` ids below qualifies (page 10 §3.2 maps each family to its monster ids).

| Family | Tame family (`tameFamily`, page 10 §3.2) | Found (page 10 §3.2 lists the exact monsters; page 01/10 own spawns) | Levels in the wild | Lean | Family trick (`G`) | Body (reuse) |
|---|---|---|---|---|---|---|
| Wolf | `tf_wolf` | Hearthvale, Greyridge, Frostmantle | 2–42 | Hunter | **Pack Call** | creatures `wolf`, `dire_wolf` |
| Great cat | `tf_cat` | Whisperwood, Sunscar, Frostmantle | 20–42 | Hunter | **Stalk** | `cat`, `saber_cat` |
| Raptor | `tf_raptor` | Sunscar, Cinder Steppe | 18–36 | Hunter | **Rend** | (new) biped-runner body; shares the mount raptor's rig (page 08 mounts) |
| Hyena | `tf_hyena` | Sunscar, Cinder Steppe | 16–36 | Hunter | **Cackle** | `hyena` |
| Boar | `tf_boar` | Hearthvale, Mossfen, Cinder Steppe | 3–34 | Guardian | **Gore Charge** | `boar` |
| Bear | `tf_bear` | Greyridge, Whisperwood, Frostmantle | 12–42 | Guardian | **Thick Hide** | `bear` |
| Crocodile | `tf_crocodile` | Mossfen, Drowned Coast | 8–48 | Guardian | **Death Roll** | `crocodile` |
| Beetle | `tf_beetle` | Sunscar, Riftmarch | 18–54 | Guardian | **Shell Up** | `beetle` |
| Elk | `tf_elk` | Whisperwood, Frostmantle | 22–42 | Guardian | **Antler Ward** | `deer` (antlered, scaled 1.3) |
| Hawk (bird of prey) | `tf_hawk` | every region from Hearthvale to Kingsfire | 3–58 | Tracker | **Eye Above** | `owl` body, hawk head and colours (bat plan) |
| Spider | `tf_spider` | Mossfen, Whisperwood, Drowned Coast | 8–48 | Tracker | **Web** | `spider` |
| Giant frog | `tf_frog` | Mossfen, Drowned Coast | 6–46 | Tracker | **Tongue Lash** | `frog` |
| Serpent | `tf_serpent` | Mossfen, Sunscar, Kingsfire | 8–58 | Tracker | **Venom Spit** | `snake` |

**Never tameable:** humanoids and warbands, undead, demons, dragonkin (drakes, dragons), elementals,
constructs, Riftborn and anything else outside the list; and, whatever the family, any **Rare** (yellow),
**Named**, **Boss**, anything with a **greater rarity** (Giant, Flaming, Electrified…), and **champion-pack**
members before calling 40. A monster that is tameable shows a small paw icon on its nameplate to a ranger
who has done the level 6 calling.

**Champion beasts (from 40).** A tamed champion-pack beast keeps **its champion affix at half strength**
(page 10's affix; e.g. *Swift* gives +15% move speed instead of +30%) and a blue name. It is the long-term
chase for rangers: the family you like, with the affix you like.

**The look you tame is the look you keep.** The beast keeps the coat, size variation (±8%) and markings it
was rolled with in the wild (creature seed), so two rangers' wolves are rarely alike.

### 2.4 Leans — what each beast is for

| Lean | Health (share of ranger's max) | Armour | BD (one beast hit) | Hits every | Threat | Role in a fight |
|---|---|---|---|---|---|---|
| **Hunter** | 55% | the ranger's armour | **40% WD** | 1.1 s | ×1 | extra damage; best stack builder |
| **Guardian** | 85% | 2× the ranger's armour | **28% WD** | 1.4 s | **×3** | holds enemies off the ranger; can tank trash in the open world |
| **Tracker** | 60% | the ranger's armour | **32% WD** | 1.2 s | ×1 | control and debuffs; trick cooldowns **−30%** |

WD here is the ranger's own weapon damage, so a better bow makes a stronger beast (§2.5).

**Family tricks** (key `G`, off the global cooldown, no Tempo; each has its own cooldown; the beast must be
alive and within 40 m):

| Family | Trick | Cooldown | Targeting | Tags | Effect |
|---|---|---|---|---|---|
| Wolf | **Pack Call** | 30 s | Self | `tag_minion`, `tag_aura`, `tag_duration` | a howl: you and the wolf gain **+15% attack speed** for 8 s, and each wolf bite on the Quarry adds **2** stacks instead of 1 for 8 s |
| Great cat | **Stalk** | 20 s | Auto-target | `tag_minion`, `tag_physical`, `tag_melee` | enemies ignore the cat for up to 15 s while it walks to your target; its next bite is an **ambush**: 250% BD and a 1 s stun (boss: interrupts a gold-bordered cast) |
| Raptor | **Rend** | 12 s | Auto-target | `tag_minion`, `tag_physical`, `tag_melee`, `tag_duration` | 3 slashes of 70% BD and a **bleed** (6 s); the target takes +5% damage from the raptor for 6 s |
| Hyena | **Cackle** | 25 s | Self | `tag_minion`, `tag_area`, `tag_curse`, `tag_duration` | every enemy within 8 m of the hyena is **weakened** (deals 10% less damage) for 6 s; +5% more for each enemy under 30% health |
| Boar | **Gore Charge** | 15 s | Auto-target | `tag_minion`, `tag_physical`, `tag_melee`, `tag_movement` | charges up to 12 m, 150% BD, knocks back 3 m and **taunts** 3 s |
| Bear | **Thick Hide** | 30 s | Self | `tag_minion`, `tag_area`, `tag_duration` | the bear takes 40% less damage for 6 s and **taunts** every enemy within 6 m for 3 s |
| Crocodile | **Death Roll** | 20 s | Auto-target | `tag_minion`, `tag_physical`, `tag_melee` | seizes one enemy for 2 s (stunned, 3 × 60% BD; boss: fills the break bar and interrupts); the croc takes 20% less damage while rolling |
| Beetle | **Shell Up** | 25 s | Self | `tag_minion`, `tag_shield`, `tag_duration` | a barrier of 25% of the beetle's health for 8 s; projectiles aimed at the ranger within 3 m of the beetle hit the beetle instead |
| Elk | **Antler Ward** | 30 s | Self | `tag_minion`, `tag_aura`, `tag_duration` | party members within 8 m of the elk take **8% less damage** for 6 s |
| Hawk | **Eye Above** | 20 s | Auto-target | `tag_minion`, `tag_aura`, `tag_duration` | the hawk circles your target for 10 s: hidden enemies within 20 m are revealed, and the whole party gets **+5% crit chance** against that target |
| Spider | **Web** | 18 s | Ground | `tag_minion`, `tag_area`, `tag_duration` | a 5 m web at a point within 30 m: roots up to 3 enemies for 3 s, then snares 30% for 4 s |
| Giant frog | **Tongue Lash** | 15 s | Auto-target | `tag_minion`, `tag_physical` | pulls one enemy up to 12 m to the frog and **interrupts** it (boss: interrupt only, no pull) |
| Serpent | **Venom Spit** | 15 s | Auto-target | `tag_minion`, `tag_poison`, `tag_duration`, `tag_curse` | poison, 30% BD a second for 6 s; the target receives **30% less healing** for 6 s |

Tracker cooldowns in this table are before their −30%. Tricks follow the boss crowd-control rule (page 00
§10): a boss ignores stun and root, and the trick fills its break bar instead.

### 2.5 How the beast scales, grows and dies

| Rule | Value |
|---|---|
| Level | Always the **ranger's level**, whatever level it was tamed at (a level-4 boar is level 37 when you are). |
| Health, armour, damage | from the lean table (§2.4), read off the ranger's current max health, armour and weapon damage. Better gear = better beast. |
| Stats it copies | 50% of your crit chance, 100% of your haste, all of your `tag_minion` bonuses. It does **not** copy +% ranged, +% projectile or quiver effects. |
| Damage cap | never hits for more than **75% of the top of your own swing** (reuse: Farhold `js/followers.js` `scaleFollower`). |
| Bond | a beast's **Bond** rises from 1 to 5 as it fights with you (rank 2 at 200 kills, 3 at 600, 4 at 1,500, 5 at 3,000 — only kills of monsters within 5 levels of you count). Each rank: **+2% beast health and damage** (max +10%). Bond is kept when the beast dies and when it is stabled. |
| Pet rules | page 00 §10: takes **no party slot**, never counts toward a soak, leaves danger zones 0.6 s after they appear and void zones after 0.5 s in one, takes **25%** damage from room-wide hits. |
| Death | a dead beast **stays down** — no timed respawn, no in-combat revive. Its body lies where it fell with a faint green glow. Slot 3 turns into **Lone Shot** while it is down (§4). Revive it out of combat with the **Rite of Return** (§6.2). |
| Refuses to Fall (calling 40) | once per **180 s**, a hit that would kill the beast leaves it at 1 health and it runs to you, taking 90% less damage for 3 s. It is not a revive — if it dies again, it is down. |

### 2.6 Commands

Commands cost nothing and are off the global cooldown.

| Key (page 02) | Command | What the beast does |
|---|---|---|
| `Q` tap | **Attack** | attacks your hard target (your Quarry if you have none). |
| `Q` hold → wheel | **Attack / Heel / Stay / Guard** | the command wheel (four spokes) |
| wheel | **Heel** | comes back and protects you: attacks anything that hits you in melee and **taunts** it for 2 s (once every 8 s; Guardian lean every 5 s). |
| wheel | **Stay** | stays where it is and fights only what attacks it. Used to set a beast on a patrol route, or to stop it pulling. |
| wheel | **Guard** | guards the party member you have targeted (`F2`–`F5` or their frame): stays within 4 m of them and attacks whatever hits them. A Guardian beast also **taunts** that enemy for 2 s, once every 5 s. |
| `G` | **Family trick** | §2.4 |

**Temper** (a setting on the beast frame's right-click menu, not a command): **Aggressive** (attacks anything
within 15 m that is in combat with the party; uses its trick on cooldown), **Defensive** (default; attacks
only what you or it are fighting; trick only on `G`), **Passive** (never attacks on its own). Setting key
`set.gameplay.beast_trick_auto` (page 04) lets Defensive beasts use the trick on cooldown too.

### 2.7 The stable, naming and letting go

- **With you:** one beast at a time. **Stable places:** 3 at calling 6, 5 at 20, 7 at 40.
- **Stablemasters** (one in every hub town and Highcourt; page 01 owns the NPCs) swap, rename and revive
  beasts at no cost. Anywhere else, **Whistle Up** (§6.4) swaps with a stabled beast.
- **Taming while a beast is with you** is not allowed: stable it first (or have a free stable place — a
  successful tame with a beast already out sends the *new* one to the stable, if there is room).
- **Naming:** a name box opens on a successful tame (2–16 letters; a **Suggest** button asks Name Forge for a
  name in the region's language — reuse `namegen/js/namegen.js`). Rename free at a stablemaster.
- **Let go:** right-click the beast frame → **Let it go**. A confirm box names it ("Let Ashcoat go back to
  the wild? This cannot be undone."). It walks away and is gone; its Bond goes with it.
- Tamed beasts are **not items**: they cannot be traded, mailed or sold.

### 2.8 HUD (new; page 03 `hud_quarry`, `hud_pet`)

- **Hunt row**: ten small arrowhead pips right of the Tempo bar (fifteen after Apex Bond); two rows after
  calling 20, each tinted like its mark (green / teal).
- On the Quarry: spellfx `STATUS_FX.marked` (`target` sprite, recoloured green) and its stack number on its
  nameplate.
- **Beast frame** under the player frame: portrait, name, lean icon (fang / shield / eye), health bar,
  Bond rank (1–5 pips), current command icon (paw / heel / stay / guard + the guarded ally's name), trick
  cooldown clock. Dead: a grey portrait with "Down — Rite of Return out of combat".
- Tooltip on the Hunt row: "7 Hunt stacks on the Tuskhide Boar. Command Strike spends up to 5 for +20% each."

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Tempo | Cooldown | Cast | Target | Shape | Tags | Headline |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `ranger_quarry_arrow` | Quarry Arrow | 20 | 4 s | instant | Auto-target | arrow, 46 m | `tag_physical` `tag_attack` `tag_ranged` `tag_projectile` | 150% WD, ignores 50% armour, marks, +2 stacks |
| 2 | 4 | `ranger_hunters_snare` | Hunter's Snare | 25 | 12 s, 2 charges | instant | Ground | trap to 25 m, 1.5 m trigger | `tag_physical` `tag_trap` `tag_duration` | root 3 s + 80% WD |
| 3 | 10 | `ranger_command_strike` | Command Strike | 20 | 10 s | instant | Auto-target | beast leaps 15 m | `tag_physical` `tag_minion` `tag_melee` `tag_attack` | 200% BD +20%/stack, stun 1 s, lean rider |
| 4 | 18 | `ranger_barbed_fan` | Barbed Fan | 40 | 9 s | instant | Auto-target | 7 arrows, 50° cone, 30 m | `tag_physical` `tag_attack` `tag_ranged` `tag_projectile` `tag_area` `tag_duration` | 55% WD each, pierce 1, bleed |
| 5 | 28 | `ranger_bounding_retreat` | Bounding Retreat | 15 | 16 s | instant | Self | leap back 12 m | `tag_movement` `tag_trap` `tag_area` `tag_physical` | caltrops 4 m 6 s, next arrow +50% |
| 6 | 40 | `ranger_skyfall_volley` | Skyfall Volley | 60 | 45 s | 1.0 s cast | Ground | 9 m circle, 40 m, 6 s | `tag_physical` `tag_attack` `tag_ranged` `tag_projectile` `tag_area` `tag_duration` | 12 × 40% WD, ×2 on the Quarry |

(Renamed: `ranger_pounce_order` "Pounce Order" → `ranger_command_strike` "Command Strike", because the beast
is no longer always a cat.)

### 3.2 Spell details

**1. `ranger_quarry_arrow` — Quarry Arrow** (level 1)
- **20 Tempo**, cooldown **4 s**, instant, single arrow, range **46 m** (longbow 54 m, crossbow 50 m, javelin 28 m —
  the weapon's own `RANGED.range`). **150% WD**, ignores **50% of armour**.
- Targeting: **Auto-target** — with no valid target it takes the enemy nearest your aim point within range
  and makes it your hard target (setting `set.gameplay.autotarget_sets_target`, page 04).
- Tags: `tag_physical`, `tag_attack`, `tag_ranged`, `tag_projectile`. Not `tag_basic_attack`, so quiver
  effects do not apply.
- Makes the target your **Quarry** (§2.1) and gives **+2 Hunt stacks**.
- Looks: Chibi 2 `shoot`; spellfx `projectile` shape `arrow`, element `physical`, green `streak` trail;
  the `target` sprite snaps onto the enemy.
- Sound: `spell.physical.launch` (bow twang), `spell.physical.impact`, `status.marked.apply`.

**2. `ranger_hunters_snare` — Hunter's Snare** (level 4)
- **25 Tempo**, cooldown **12 s**, **2 charges**, instant throw to a ground point within **25 m**. Arms after **1 s**.
- Targeting: **Ground**. Tags: `tag_physical`, `tag_trap`, `tag_duration`.
- A hidden trap with a **1.5 m trigger radius**; lasts **60 s**; up to **3** out at once (the oldest is removed).
- On trigger: **root 3 s** and **80% WD** to the enemy that stepped on it; if you have no Quarry, it becomes
  your Quarry. Enemies cannot see traps; allies see a faint outline. A boss is not rooted (page 00 §10) —
  its break bar fills instead.
- Looks: Chibi 2 `throw`; a small wire-and-stake prop (new model, ~200 triangles), `root_vine` sprites and
  `STATUS_FX.root` on trigger.
- Sound: `rope.creak` on placing, `status.root.apply` on trigger.

**3. `ranger_command_strike` — Command Strike** (level 10)
- **20 Tempo**, cooldown **10 s**, instant. The beast **leaps up to 15 m** onto your target (your Quarry if you
  have no target) and hits for **200% BD**, **+20% per Hunt stack spent** (spends up to 5).
- Targeting: **Auto-target**. Tags: `tag_physical`, `tag_minion`, `tag_melee`, `tag_attack`.
- **Stun 1 s** (boss: **interrupts** a gold-bordered cast).
- **Lean rider** (the same spell does a different extra job per lean): **Hunter** — +30% damage and the hit
  cannot miss; **Guardian** — **taunts** the target for 4 s and sets the beast's threat to 110% of the highest;
  **Tracker** — applies the family's trick debuff for 4 s without starting the trick's cooldown (hawk: the
  +5% party crit; spider: 2 s root; frog: interrupt; serpent: −30% healing received).
- If the beast is down the button becomes **Lone Shot** (§4).
- Looks: the beast's `attack` clip with a long leap arc; spellfx `impact` `physical` + `shadow_claw` sprites
  (a hawk dives from 10 m instead).
- Sound: the family's creature cry (reuse the `sfx` beast voice family, pitched per family), `melee.crit`.

**4. `ranger_barbed_fan` — Barbed Fan** (level 18)
- **40 Tempo**, cooldown **9 s**, instant. **7 arrows** in a **50° cone**, range **30 m**.
- Targeting: **Auto-target** — turns you to face your target (or the auto-picked one) and fires the cone at
  it; with nothing valid in range it fires where you aim.
- Tags: `tag_physical`, `tag_attack`, `tag_ranged`, `tag_projectile`, `tag_area`, `tag_duration`.
- **55% WD** each; each arrow **passes through 1 enemy**; each applies **bleed** (page 05, 6 s; one bleed per
  enemy). Each arrow that hits the Quarry adds **1 Hunt stack**.
- Looks: Chibi 2 `shoot` (fast); spellfx `projectile` ×7 with `spread`, `bleed` drops on hit.
- Sound: a rattle of `spell.physical.launch` ×3 layered, `status.bleed.apply`.

**5. `ranger_bounding_retreat` — Bounding Retreat** (level 28) — **the movement tool**
- **15 Tempo**, cooldown **16 s**, instant. Leap **12 m backward** (0.5 s in the air). While airborne you are
  **not affected by ground effects** (void zones, danger zones, puddles) but can still be hit by attacks in
  the air or by projectiles.
- Targeting: **Self**. Tags: `tag_movement`, `tag_trap`, `tag_area`, `tag_physical`.
- Drops **caltrops** in a **4 m circle** where you started: **6 s**, **snare 50%**, **20% WD a second**.
- Your next arrow within **4 s** deals **+50%**.
- Looks: Chibi 2 `jump` played backward with a flip; `puff` dust at take-off; spike decals (`thorn` sprite,
  steel colour) for the caltrops.
- Sound: `travel.step` + a cloth whoosh, `status.slow.apply` when an enemy steps in.

**6. `ranger_skyfall_volley` — Skyfall Volley** (level 40)
- **60 Tempo**, cooldown **45 s**, **1.0 s cast** (the ranger fires straight up). A **9 m circle** anywhere
  within **40 m**, lasting **6 s**.
- Targeting: **Ground** (the circle snaps to your target's feet if you press it with a target and the setting
  `set.gameplay.ground_at_target` is on, page 04).
- Tags: `tag_physical`, `tag_attack`, `tag_ranged`, `tag_projectile`, `tag_area`, `tag_duration`.
- Arrows fall every **0.5 s**: **40% WD** to every enemy inside per tick (12 ticks = **480%**). Ticks on the
  **Quarry** deal **×2** and add **1 Hunt stack** each.
- On cast it **spends all Hunt stacks**: **+5% damage per stack** for the whole volley (and 2 Tempo back per
  stack).
- Looks: Chibi 2 `shoot` angled up; spellfx `aoe` with arrow `projectile`s falling from 12 m, a `ring` marking
  the edge (green, so allies know it is friendly — green is "Beneficial" in page 11's language, and nothing
  about it asks allies to stand in or out).
- Sound: a whistle building for 1 s, then `spell.physical.impact` scattered through the 6 s.

### 3.3 Rotation / how it plays

- **Solo:** tame a Guardian or Hunter to taste. Quarry Arrow the dangerous one, beast on **Attack**; Hunter's
  Snare between you and the pack; Barbed Fan when they bunch; Command Strike at 5 stacks; Bounding Retreat when
  something reaches you, then an empowered Quarry Arrow. Skyfall on the elite with 10 stacks. A bear on
  **Heel** lets a ranger stand still and shoot through most open-world pulls.
- **Dungeon (Damage):** a Hunter beast. Mark the pack's caster (the tank sees it and picks up the rest). Beast
  on **Attack** (Heel if you pull threat). Snare on the patrol route before the pull. Barbed Fan on the pack,
  Command Strike as the group's second interrupt.
- **Dungeon boss:** the Quarry stays on the boss the whole fight; stacks are banked for Skyfall in the burn
  phase or for Command Strike interrupts on a schedule. Second Quarry (20+) goes on a priority add. A cat's
  **Stalk** before the pull gives an opening ambush. Bounding Retreat is kept for the mechanic, not damage.
- **Support:** §5.

### 3.4 Boss mechanics

| Mechanic (page 11) | Ranger |
|---|---|
| Void / danger zones | **Bounding Retreat** ignores ground effects while airborne (0.5 s) — the class's main dodge; plus the dodge roll. The beast leaves on its own (pet rules, §2.5). |
| Soak (orange) | The ranger counts as one soaker; the **beast never counts**. Light armour: soak only with a healer ready. |
| Targeted (yellow, spread) | 46 m range makes spreading easy. |
| Interrupts | Command Strike (10 s) interrupts gold-bordered casts; so do a cat's Stalk ambush, a croc's Death Roll and a frog's Tongue Lash. |
| Adds | Snare roots them; Barbed Fan hits a line; a Guardian beast on **Guard** holds one add off a healer. |
| Kiting | The best kiter: caltrops, roots, 46 m range. |
| Room-wide hits | The beast takes 25% (pet rules). |
| Line of sight | Arrows need it; Skyfall Volley does not (it falls from above). |

---

## 4. Alternate spells

| When | Slot 3 becomes | What it does |
|---|---|---|
| The beast is **down**, stabled or let go | **`ranger_lone_shot` "Lone Shot"** | 20 Tempo, shares Command Strike's 10 s cooldown, instant, **Auto-target**, 46 m. `tag_physical` `tag_attack` `tag_ranged` `tag_projectile`. **160% WD**, **+15% per Hunt stack spent** (up to 5), **interrupts** (no stun). The ranger is never left without a slot-3 spell. |
| The beast is alive | Command Strike, with its **lean rider** (§3.2) | Hunter: +30%, cannot miss · Guardian: taunt 4 s · Tracker: family debuff 4 s |

The family trick on `G` is the other thing that changes with the beast (§2.4). It is not a spell: no Tempo,
no global cooldown, no talents.

---

## 5. The hybrid role — Support

**Role focus.** The ranger uses the canon **Role focus** switch (00 §6; spellbook, out of combat, saved per
Loadout). Set to **Hybrid (Support)**, it changes only your Dungeon Finder role (Support); the support build below is
your talent and beast choices, which a Loadout saves alongside the switch.

**What it is.** The ranger queues as **Support** (a Damage slot in the Dungeon Finder, page 00 §4). A
support ranger still does most of its damage but spends its picks on things that help four other people: a
mark the whole party hits harder, control from traps, a Tracker beast's debuffs, and a haste howl.

**The support build** (all available by 28; the full build at 40):

| Part | Pick | What the party gets |
|---|---|---|
| Beast | a **Tracker** — hawk (crit), serpent (anti-heal), spider (roots) or frog (interrupts) | Hawk: **+5% crit chance** for everyone against the target, 10 of every 14 s (20 s cooldown −30%); Command Strike's rider adds 4 s more |
| Quarry Arrow t2 | **Hunter's Brand** | the Quarry takes **+10% damage from everyone** (the core of the build) |
| Hunter's Snare t2 | **Snare Line** or **Smoke Pot** | a 4 m group root, or a pack that drops its targets |
| Command Strike t2 | **Pack Howl** | party members within 20 m gain **+10% haste for 6 s** every 10 s (60% uptime) |
| Barbed Fan t2 | **Sapping Barbs** | poisoned enemies deal **8% less damage** for 6 s |
| Skyfall Volley t2 | **Arrow Grove** | allies inside take **15% less damage from ranged attacks** for 6 s after it ends |
| Gear | `set_ranger_trailwarden` (§8.3) | longer, wider versions of the above |

**How well.** In the open world, Normal dungeons and Depth up to about 10, a support ranger adds roughly
**+10% party damage on the Quarry**, **+6% party haste on average**, **−8% incoming damage from poisoned
packs** and one extra interrupt every 10–15 s, while keeping about **75% of a damage ranger's own damage**.

**Why it is weaker in Challenge mode.** (1) Its control is mostly roots and stuns, and Challenge bosses and
their named adds ignore both (they only fill a break bar, page 00 §10). (2) Hunter's Brand is one +10% on
one target; a primary Support class brings larger party-wide effects (for example the Tactician's Orders).
(3) The haste and crit are short windows tied to cooldowns, not steady auras. A ranger can still clear
Challenge as Support; a group will simply get more from a primary Support class there.

---

## 6. Utility spells (no slot, out of combat)

These sit in the spellbook's **Utility** tab (page 03), can be put on the action bar, cost nothing, and are
refused in combat ("You cannot do that while fighting").

### 6.1 `ranger_tame_beast` — Tame Beast (from calling 6)

| Rule | Value |
|---|---|
| Targeting | **Needs target** — a tameable beast (§2.3), level **at or below yours**, within **20 m**, in line of sight |
| Health gate | the beast must be at or below **60% health** (weaken it first — with a trap, a few arrows, or your current beast) |
| Cast | **channel 6 s**. You may not move. The rest of the party may keep fighting other enemies; the beast being tamed **cannot drop below 1 health** while you channel. |
| The beast fights back | it keeps attacking you during the channel. Hits do not break it, but any single hit of **8% or more of your max health** pushes the channel back **0.5 s** (at most 3 times). |
| What breaks it | moving, a stun, knockdown, silence or interrupt on you, losing line of sight, the beast leaving 25 m, or the beast dying. |
| Combat | this is the one "utility" that is used **in** a fight — against the beast being tamed only. If any other enemy is attacking **you**, it is refused. |
| Success | the beast calms (a green ring and a soft call), returns to full health, joins you at your level, and the name box opens (§2.7). If a beast was already with you, the new one goes to the stable if there is a free place; otherwise the tame is refused before it starts. |
| Failure | the beast is **enraged** for 10 s (+20% damage) and cannot be tamed by you again for 30 s. |
| Tags | `tag_nature`, `tag_channel` |
| Looks / sound | Chibi 2 `talk` clip with an open hand held out; green `leaf` sprites drift between you and the beast; a low hum that rises through the channel |

### 6.2 `ranger_rite_of_return` — Rite of Return (from calling 6) — **the revive ritual**

- **Out of combat only.** **Channel 5 s**. No cost, no cooldown. Targeting: **Self** (it calls the beast to you;
  no body needs to be found). Tags: `tag_nature`, `tag_channel`, `tag_heal`.
- The ranger kneels, lays a hand on the ground and speaks the beast's name; the beast walks out of the
  nearest cover at **full health**. Its Bond is kept.
- On a **living** beast it heals it to full instead (the same 5 s).
- Breaks if you move or enter combat. Works anywhere, including inside dungeons between pulls. There is **no
  limit** on revives (page 00 §12.1 W21 — in combat the rule is simply that the beast stays down).
- Looks / sound: Chibi 2 `kneel` → `talk`; a ring of grass and small flowers grows around you over 5 s
  (spellfx `ring`, element `nature`); a whistle, then the family's call answering from off-screen.

### 6.3 `ranger_read_the_trail` — Read the Trail (from calling 6)

- A toggle (no cast, no cost). While on, the minimap and map (page 03) show **tameable beasts within 150 m**
  as paw icons tinted by lean (red Hunter / blue Guardian / green Tracker), with their level. Champion beasts
  (from calling 40) show a blue paw. Also shows the direction of the nearest Normal beast of a family you have
  never tamed. Tags: `tag_nature`.

### 6.4 `ranger_whistle_up` — Whistle Up (from calling 6)

- **Out of combat only.** **8 s cast**, cooldown **10 minutes**. Opens the stable list and swaps the beast
  with you for one in the stable. At a stablemaster the swap is instant and free of the cooldown.
  Targeting: **Self**. Tags: `tag_nature`.

---

## 7. Talents

Id = spell id + `_t<tier><letter>`. A tier opens at its level or when the spell unlocks, whichever is later
(page 00 §10). Talents that mention "the beast" work with any tamed beast.

### Quarry Arrow
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Splitting Quarry** — on impact, 3 shards fly on 5 m behind the target for 40% WD each (adds `tag_area`). | **Long Draw** — hold up to 1.2 s: range 70 m and up to +100% WD at full hold (adds `tag_channel`). | **Twin Arrow** — two arrows 0.2 s apart, 85% WD each, +1 stack each. |
| 2 (22) | **Hunter's Brand** — the Quarry takes +10% from **everyone**, not only you and the beast. | **Tracking** — the Quarry shows through walls and to hidden enemies' eyes; the arrow turns up to 4 m to follow it. | **Heartseeker** — ignores **all** armour; crits on the Quarry deal +50% crit damage. |
| 3 (32) | **Dead Eye** — the 3rd Quarry Arrow in a row on the same target is a guaranteed crit and gives +3 stacks. | **Drive the Prey** — knocks the Quarry back 3 m and snares it 30% for 4 s. | **Sic 'Em** — the beast leaps onto the Quarry at once: a free Command Strike at 50%, no stacks spent. |
| 4 (45) | **Ricochet Quarry** — the arrow bounces to the next enemy and makes it a second Quarry (even before calling 20). | **Kill Shot** — on a Quarry under 20% health: 400% WD; a kill resets the cooldown. | — |

### Hunter's Snare
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Bear Jaw** — root 5 s and bleed. | **Flash Wire** — a 5 m flash that **blinds** 4 s instead of rooting. | **Live Wire** — arms the moment it lands. |
| 2 (22) | **Snare Line** — a sprung snare also roots every other enemy within 4 m for half as long. | **Smoke Pot** — a 5 m smoke cloud: enemies inside lose their target and drop 50% threat on you for 3 s. | **Lure** — the trap makes a noise: enemies within 12 m walk to it. |
| 3 (32) | **Sprung Signal** — the beast makes a free Command Strike (50%, no stacks) on anything that sets off a trap. | **Blasting Cap** — 200% WD in a 4 m circle (adds `tag_area`, `tag_fire`). | **Tar Pit** — leaves 6 m of tar for 8 s (snare 60%). |
| 4 (45) | **Warren** — 5 traps out at once, 3 charges. | **Big Game** — on a boss: fills 15% of its break bar and gives +5 Hunt stacks. | — |

### Command Strike
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Worrying Strike** — 3 bites of 90% BD plus bleed, no stun. | **Switch** — you and the beast swap places (a 15 m movement tool; adds `tag_movement`). | **Guard Strike** — the beast leaps on whatever is hitting *you* and taunts it 3 s. |
| 2 (22) | **Throat** — **silences** 3 s (boss: interrupt + that spell locked 4 s). | **Two Strikes** — 2 charges. | **Pack Howl** — party members within 20 m gain +10% haste for 6 s (adds `tag_aura`). |
| 3 (32) | **Feast** — spending 5 stacks heals the beast 30% and you 10% (adds `tag_heal`). | **Pin Down** — rooted 2 s and takes +20% from you while pinned. | **Lie Low** — after the strike, the beast is ignored by enemies for 6 s; its next hit deals +100%. |
| 4 (45) | **Apex Strike** — with 10+ stacks it hits everything in a 5 m circle (adds `tag_area`). | **Bond of Claws** — for 8 s your arrows also strike the beast's target for 30% as a claw echo. | — |

### Barbed Fan
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Wide Fan** — 11 arrows in 90°. | **Tight Fan** — 5 arrows in 15°, 80% WD each (all can hit one target). | **Ring of Barbs** — a 360° ring of 12 arrows, 40% WD each. |
| 2 (22) | **Pinning Barbs** — each arrow snares 10%, stacking. | **Seeking Barbs** — arrows curve toward your Quarry. | **Sapping Barbs** — poison instead of bleed (`tag_poison`); poisoned enemies deal 8% less damage; it spreads to one enemy within 5 m when the target dies. |
| 3 (32) | **Reclaimed Arrows** — each enemy hit refunds 3 Tempo. | **Glancing Barbs** — each arrow bounces once. | **Step and Loose** — you hop back 4 m as you fire. |
| 4 (45) | **Hail** — a second fan fires 0.5 s later. | **Thicket** — arrows stay in the ground as a 6 s barbed field (10% WD a second). | — |

### Bounding Retreat
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Any Way** — leap in the direction you are moving. | **Two Bounds** — 2 charges. | **Beast's Bound** — the beast jumps too, lands in front of you and taunts for 2 s. |
| 2 (22)\* | **Net** — on take-off, a net roots the nearest enemy 3 s. | **Vanishing Leap** — drop 50% threat and enemies lose sight of you for 2 s. | **Stunning Caltrops** — the first enemy on them is stunned 1 s. |
| 3 (32) | **Aerial Shot** — while airborne, Quarry Arrow has no cooldown. | **Long Bound** — 18 m. | **Clean Landing** — landing heals 8% max health (adds `tag_heal`). |
| 4 (45) | **Untouchable** — immune to all damage during the leap and 0.3 s after landing. | **Hunter's Reset** — refills your snare charges. | — |

\* unlocks at 28: tiers 1–2 open together.

### Skyfall Volley
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Rolling Sky** — the circle drifts 2 m a second toward the Quarry. | **Narrow Sky** — 4 m circle, ticks ×2.5. | **Sudden Sky** — no cast time; lasts 3 s with ticks twice as often. |
| 2 (22)\* | **Burning Sky** — the arrows burn (adds `tag_fire`). | **Pinning Rain** — enemies inside are snared 40%. | **Arrow Grove** — when it ends, the arrows stand as cover: allies inside take 15% less from ranged attacks for 6 s. |
| 3 (32)\* | **Hunting Weather** — the beast attacks 30% faster inside it. | **Storm of Barbs** — each tick has a 10% chance to drop a barbed arrow on a random enemy within 15 m. | **Hunter's Harvest** — each kill inside refunds 5 s of cooldown. |
| 4 (45) | **Last Arrow** — the final tick is one great arrow on the Quarry for 300% WD. | **Two Skies** — two 6 m circles. | — |

\* unlocks at 40: tiers 1–3 open together.

---

## 8. Class sets

Six pieces per set: head, chest, legs, hands, feet + quiver or necklace. Page 09 owns the index. Loot is
personal and tradeable (page 00 §4).

### 8.1 `set_ranger_wildstalker` — The Wildstalker's Garb (Damage; dungeon set)
Drops on **Normal** at the dungeon's own level (the set scales to the level you wear it at) and on
**Challenge** at level 60: head `d07_thornheart` boss 2, chest `d08_moonwell_ruins` boss 2, legs
`d10_rimefang_caverns` boss 3, hands `d09_warmasters_pit` final boss, feet `d05_glass_tombs` boss 3, quiver
(`it_wildstalker_quiver`) `d12_unmade_workshop` final boss.
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Quarry Arrow gives **+3** stacks. | Quarry Arrow |
| 4 | Every trap that goes off gives your beast a free **ambush** on its next hit (250% BD, as the cat's Stalk). | Hunter's Snare, beast |
| 6 | Command Strike spends **up to 10** stacks at +20% each. | Command Strike |

### 8.2 `set_ranger_apex_hunt` — Trappings of the Apex Hunt (Damage; was the raid set)
**New source (round 2):** the raid that dropped it is parked in `WISHLIST.md`. It now drops from
**Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per boss, weekly loot limit per
page 00 §12.1 W5) and from the **end chest of any dungeon run at Depth 10 or deeper** (page 12 owns the odds).
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Barbed Fan fires **two** arrows at the Quarry among its seven, each +1 stack. | Barbed Fan |
| 4 | Bounding Retreat's empowered arrow (+50%) applies to your next **two** arrows and both give +2 stacks. | Bounding Retreat |
| 6 | Skyfall Volley **keeps** half the stacks it spends; your beast attacks at double speed inside it. | Skyfall Volley, beast |

### 8.3 `set_ranger_trailwarden` — The Trailwarden's Kit (Support; new, crafted)
**Source:** **Leatherworking** (page 19). Recipes are sold by the **Greenhand** quartermaster (page 00 §12.2)
at *Trusted*, in three versions made at levels 20, 40 and 60. Any Leatherworker can make it for a ranger
(the pieces trade freely).
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Hunter's Brand's bonus is **+13%** and lasts 5 s after the Quarry mark moves. | Quarry Arrow |
| 4 | Pack Howl reaches **30 m** and lasts 8 s; your Tracker beast's trick cooldown is a further 15% shorter. | Command Strike, family trick |
| 6 | Every trap that goes off or Skyfall that ends gives party members within 10 m a barrier of **6% of their max health** for 6 s (once per 10 s). | Hunter's Snare, Skyfall Volley |

---

## 9. Class legendaries, uniques and souls

All items below are ranger-only (`classes: ["ranger"]`). Legendary cap: 2 worn (page 00 §4).

### Legendaries
| id | Name | Slot / base | Power | Drop source (round 2) |
|---|---|---|---|---|
| `leg_the_long_patience` | The Long Patience | longbow | **Patience** — every 2 s without firing, your next Quarry Arrow gains +25% (max +150%, 12 s). | `d14_ashen_reliquary` final boss, **Challenge** (was a raid boss) |
| `leg_collar_of_the_twin_trail` | Collar of the Twin Trail | necklace | **Two of Them** — a pale echo of your beast runs beside it at 50% BD (it copies the real beast; it cannot be hit and vanishes if the beast is down). Command Strike sends both. | the world boss of `whisperwood` (page 13) |
| `leg_wirewalkers_boots` | Wirewalker's Boots | light feet | **Walk the Wire** — you can see and step onto your own traps: doing so launches a free 12 m Bounding Retreat in the direction you face (no cooldown). | `d12_unmade_workshop` final boss on **Challenge**, or any Depth 15+ end chest |
| `leg_skyfall_string` | Skyfall String | bow | **Falling Star** — Skyfall Volley follows the Quarry and the Quarry cannot leave it. | `d16_the_spire` final boss, **Challenge** (was a raid boss) |

(Renamed: `leg_greatcats_collar` "The Great-Cat's Collar" → `leg_collar_of_the_twin_trail` "Collar of the Twin
Trail", because the beast is no longer a cat.)

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_brightwater_snare_kit` | Brightwater Snare Kit | light hands | Hunter's Snare has 3 charges and lasts 120 s. | `d02_drowned_mill` boss 2 |
| `uq_marking_quiver` | Marking Quiver | quiver (off hand) | The first arrow you fire after a Quarry dies marks the nearest enemy with 3 stacks. | `d06_sandsworn_vault` boss 2 |
| `uq_beastbond_charm` | Beastbond Charm | ring | Your beast has 30% more health, and Heel / Guard taunts come every 4 s instead of 8 s / 5 s. | `d03_shaft_seven` final boss |
| `uq_tamers_lure` | Tamer's Lure | necklace | Tame Beast channels in 3 s and ignores the 60% health gate on beasts 5+ levels below you. | a Greenhand quest reward at *Welcome* (page 14 owns the id) |

(Renamed: `uq_whisker_charm` "Whisker Charm" → `uq_beastbond_charm` "Beastbond Charm".)

### Souls (new; page 08 owns socket rules, page 09 the catalogue)
| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_blood_trail` | Blood Trail | weapon (bow, crossbow, javelin) | class: ranger | When your Quarry dies, the mark jumps to the nearest enemy within 20 m with **all** its stacks, and your beast leaps there and uses its family trick for free (once per 10 s; the trick's cooldown is not started). | `d10_rimefang_caverns` final boss on Challenge (5%), or any beast-family Rare in the open world (1 in 2,000) |
| `soul_shared_breath` | Shared Breath | jewellery (necklace or ring) | class: ranger | Changes the no-revive-in-combat rule for you: once per **120 s**, 8 s after your beast dies, a Rite of Return runs by itself and the beast returns at **40% health**. | the world boss of `frostmantle` (page 13), 3% per weekly kill; or Depth 20+ end chests |

---

## 10. Voice and barks

- Timbre: `shared/voices.js` role `ranger` (pitch 0.50, breath 0.25 — quiet, a little breathy).
- Lingo tag `class:ranger`; the beast binds as `{beast.name}`. Beasts have no words — they use their family's
  creature sounds (growl, grunt, screech, croak, hiss).

| Moment | Lines |
|---|---|
| Quarry Arrow (new mark) | "That one." · "You're mine." |
| Hunter's Snare | "Watch your step." |
| Command Strike | "Take it!" · "Go, {beast.name}!" · "Now!" |
| Barbed Fan | "Scatter." |
| Bounding Retreat | "Too close." · "Back!" |
| Skyfall Volley | "Look up." |
| Tame Beast starts | "Easy… easy now." |
| Tame succeeds | "There you are. You're with me now." |
| Tame fails | "Not today, then." |
| Rite of Return | "Come back to me, {beast.name}." |
| Critical hit | "Clean kill." |
| Beast goes down | "No— {beast.name}!" · "Hold on, I'll bring you back." |
| Low health | "I'm hit, I'm hit!" |
| Quarry dies | "Next trail." |

---

## 11. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Creature bodies `wolf`, `dire_wolf`, `cat`, `saber_cat`, `hyena`, `boar`, `bear`, `crocodile`, `beetle`, `deer`, `owl`, `spider`, `frog`, `snake` | `avatar-3d/js/creatures.js`, `js/creature-types.js` | tamed beasts (the raptor body is new) |
| Pet AI states follow / engage / return | `prototypes/farhold/js/pets.js` | beast AI; Heel, Stay, Guard and Temper are new states |
| Level scaling + 75% cap | `prototypes/farhold/js/followers.js` `scaleFollower` | beast damage |
| Old `hunting_cat` entry | `prototypes/farhold/data/enemies.json` | only as the starting numbers for the Hunter lean |
| Name suggestions | `namegen/js/namegen.js` | beast naming |
| Bow draw / range per weapon | `prototypes/farhold/js/weapons.js` `RANGED`, `WEAPON_TRAITS.pierceBodies` | basic attacks; spell range |
| Timbre `ranger` | `shared/voices.js` | voice |
| Look (leather, travel cloak, herb satchel, bow) | `avatar-3d/data/class-outfits.json` `classes.ranger` | default outfit |
| Clips `shoot`, `throw`, `jump`, `kneel`, `talk`; creature `attack` | `avatar-3d/js/chibi2-motion.js`, `avatar-3d/js/creatures.js` | spells, beast, rituals |
| Visual ideas of Farhold `aimed_shot`, `multi_shot`, `pinning_shot`, `rain_of_arrows` | `prototypes/farhold/data/skills.json` | effects only — ids/names/numbers new |
| `STATUS_FX.marked`, `.root`, `.bleed` | `avatar-3d/js/spellfx.js` | Quarry, traps, fan |
| `smoke_trap` idea | `prototypes/emberveil/data/skills.json` | Smoke Pot talent |
| Sound ids | `sfx/data/catalog.json` | as listed |
| Talent engine | `prototypes/farhold/js/skilltalents.js`; new mod keys `stacks`, `pet`, `trap`, `lean` | talent cards |
