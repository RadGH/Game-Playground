# Tinker — class 28

> *"Hold this. No — the other end. The end that isn't ticking."*

**Role:** Damage · **Can also:** Support · **Armour:** medium · **Resource:** Focus + **Scrap** · **Primary attribute:** DEX (INT second — See QUESTIONS.md C15)
Owner of this file: every `tinker_*` spell, gadget, talent, set, legendary and unique. Template: [page 00 §5](../00-OVERVIEW.md).

### Numbers used on this page

| Term | Meaning |
|---|---|
| **% weapon** | percent of your crossbow's damage roll. Gadgets use **your** weapon damage at the moment they are placed (they do not update if you swap weapons). |
| Focus | 0–100, regenerates 12 per second |
| Gadget | anything you place in the world: sentry, mines, battery, drone, walker. Gadgets are bodies with health (page 05) that enemies **can** attack. |
| Gadget cap | how many gadgets you may have out at once (mines count as one gadget per throw) |
| Scrap | 0–10 pieces, the Tinker's second resource (§2) |
| GCD | 1.0 s |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A clockwork engineer from the Greyridge workshops who fights with a hand crossbow in one hand and a bag of ticking inventions in the other. The fight is a workbench: lay out gadgets, keep them fed, overclock them at the right moment, collect the pieces. |
| Role | Damage (ranged, zone control). Support through the Aether Battery and Patchwork Drone. |
| Armour | medium (smith apron, goggles, pocket-watch, gear pack) |
| Weapons | crossbow or hand crossbow (two-hand / one-hand) + optional dagger off hand. `(reuse: farhold/js/weapons.js crossbow pattern; bow draw rule)` |
| Resource | Focus |
| Companion | **Cog Sentry** is a spell (slot 2), not a permanent pet. At Calling 20 a **Toolbelt** lets you choose which sentry model it builds. |
| Playstyle | 1) Place gadgets before the fight reaches them. 2) Shoot Rivet Shots while the gadgets work. 3) When a gadget runs out it drops Scrap; spend Scrap to Overclock another gadget, which ends in a blast. |

Starting kit: Brass Hand Crossbow, medium apron-coat, light boots, goggles (cosmetic), 1 spell (`tinker_rivet_shot`).

---

## 2. Class mechanic — Gadgets, Scrap and Overclock

### 2.1 Rules

- **Gadget cap:** 2 at level 1 → 3 (Calling 6) → 4 (Calling 20) → 5 (Calling 40). A new gadget over the cap removes your oldest (it drops its Scrap).
- **Scrap:** when a gadget expires, is destroyed or is removed, it drops **1 Scrap** (the Walker drops 3). Scrap flies to you automatically within 20 m (a brass spark). Max 10. Scrap is kept for 30 s after combat, then lost.
- **Overclock** (Calling 6, class key `Q` — page 02 §5.16): target one of your gadgets within 25 m (the one under the crosshair, else the newest). Costs **3 Scrap**. The gadget works **+60% faster** (fire rate, pulse rate, heal rate) for 6 s, then **overloads**: it explodes for 200% weapon in 5 m (enemies only) and is removed (which drops its Scrap again, so an overclock nets −2 Scrap). 1 s cooldown.
- **Toolbelt** (Calling 20): at any Workbench (towns, camps — page 01) or out of combat anywhere via the Toolbelt panel (`scr_tinker_toolbelt`, page 03), choose one **model** for each of: Cog Sentry, Springtrap Mine, Iron Walker. Changing a model takes 5 s, no combat.
- **Linkage** (Calling 40): your gadgets within 10 m of each other are joined by a brass-blue arc (visual tether). Each gadget gets +8% effect per linked gadget (max +32%). **Contraption:** when all five of your gadgets are linked at once, every 10 s they fire together — a 6 m shockwave around each gadget for 120% weapon.

### 2.2 The gauge (HUD)

- **Workbench strip** above the Focus bar: one **gear icon per gadget out** (up to 5), each showing the gadget's picture, a ring for lifetime left and a red fill for its health lost. Click-free: hovering a gear highlights that gadget in the world.
- **Scrap counter**: ten small brass nuts to the right of the strip; full nuts are lit. At 3+ the Overclock key icon lights.
- Overclocked gadgets show a spinning red cog on their gear icon with the 6 s countdown.
- Linkage (Calling 40): lines between gear icons that are linked; the Contraption timer shows as a small clock when active.

### 2.3 Calling quests

| Level | Quest id | Summary | Grants |
|---|---|---|---|
| 1 | — | — | 2 gadgets, Scrap drops (nothing to spend it on yet: it auto-converts to +5 Focus each). |
| 6 | `q_calling_tinker_1` | Hearthvale: repair Brightwater's broken mill-wheel with parts salvaged from wrecked scarecrow-constructs (kill 8, collect 10 scrap), then defend it with your sentry against a night raid. | **Overclock**, the **Scrap counter** and gauge, **3 gadgets**. |
| 20 | `q_calling_tinker_2` | Greyridge → Sunscar: a Deepforge tinkerer lends you her blueprints if you field-test three prototypes (a flame sentry at a scorpion nest, a mending sentry escorting a caravan, a frost mine at a pass). | **Toolbelt** (sentry, mine and walker models) and **4 gadgets**. |
| 40 | `q_calling_tinker_3` | Riftmarch: build a rift-anchor from five gadgets in the right layout (a placement puzzle on a grid of floating stones) while rift-spawn attack it for 3 minutes. | **Linkage** + **Contraption** and **5 gadgets**. |

---

## 3. The six spells

### 3.1 At a glance

| Slot | id | Name | Lvl | Cost | CD | Cast | Range | Shape | Main number |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `tinker_rivet_shot` | Rivet Shot | 1 | 15 Focus | — | instant | 36 m | bolt | 110% weapon |
| 2 | `tinker_cog_sentry` | Cog Sentry | 4 | 35 Focus | 12 s | 0.5 s | place 15 m | gadget, 25 m reach | 35% weapon / 1 s, 20 s |
| 3 | `tinker_springtrap_mine` | Springtrap Mine | 10 | 30 Focus | 16 s | instant | throw 20 m | 3 mines, 4 m blast | 150% weapon + root 2 s each |
| 4 | `tinker_aether_battery` | Aether Battery | 18 | 30 Focus | 45 s | 0.5 s | place 12 m | gadget, 8 m aura | +15% haste, resource regen |
| 5 | `tinker_patchwork_drone` | Patchwork Drone | 28 | 40 Focus | 30 s | instant | 30 m | ally | 3% max HP/s for 10 s, 20% barrier save |
| 6 | `tinker_iron_walker` | Iron Walker | 40 | 60 Focus | 120 s | 1.5 s | place 10 m | gadget (counts as 2) | punches 200%, rockets 6 × 60% |

### 3.2 Details

**`tinker_rivet_shot` — Rivet Shot** (slot 1, level 1) `(new)`
- 15 Focus · no cooldown · instant · 36 m · bolt, 1 m splash.
- 110% weapon. An enemy hit within 6 m of one of your gadgets is **Tagged** for 6 s: your gadgets prefer Tagged targets.
- Look: a brass rivet with a blue spark trail (spellfx `physical` arrow + `lightning` spark trail). Sound: a sharp clank-thwip.

**`tinker_cog_sentry` — Cog Sentry** (slot 2, level 4) `(new)` — gadget
- 35 Focus · 12 s · 0.5 s cast · placed on the ground up to 15 m · lasts 20 s · health 25% of yours · max 1 Cog Sentry (talents: 2).
- Fires at the nearest (or Tagged) enemy within 25 m every 1.0 s for **35% weapon**. Model depends on the Toolbelt (§4).
- Look: a knee-high brass tripod with a spinning barrel (Farhold `clockwork_sentry` pet model). Sound: ratchet wind-up, rhythmic "chk-chk" shots.

**`tinker_springtrap_mine` — Springtrap Mine** (slot 3, level 10) `(new)` — gadget (one gadget for all 3)
- 30 Focus · 16 s · instant · throws 3 mines in a 30° fan up to 20 m · arm after 1 s · last 30 s.
- Each triggers when an enemy comes within 1.5 m: **150% weapon in 4 m** and **root 2 s** (bosses: no root; +10% damage taken from you for 4 s).
- Look: palm-sized brass discs that snap open like jaws (spellfx `physical` impact + root_vine STATUS_FX swapped for iron jaws). Sound: click-click arming, a spring "sprang" and bang.

**`tinker_aether_battery` — Aether Battery** (slot 4, level 18) `(new)` — gadget, **support**
- 30 Focus · 45 s · 0.5 s · placed up to 12 m · 12 s · health 30% of yours.
- Allies within 8 m: **+15% attack and cast speed**, and per second regain 2 Focus / 2 Fury / 0.5% of max Mana.
- Your gadgets within 8 m work **30% faster**.
- Look: a waist-high glass battery with a blue crackling core (Farhold `tinker` look `chest_glow` colour `#40c8ff`), a blue ground ring (spellfx `lightning` ground disc). Sound: electric hum loop.

**`tinker_patchwork_drone` — Patchwork Drone** (slot 5, level 28) `(new)` — gadget, **support heal**
- 40 Focus · 30 s · instant · an ally (or yourself) within 30 m · 10 s.
- A little propeller drone orbits the ally, healing **3% of their max health per second**. If the ally drops below 30% health while the drone is on them, the drone **pops**: barrier 20% of their max health for 6 s, and ends.
- Look: a flying cog with rivet-arms dripping brass patches (holy_mote sprites recoloured brass). Sound: a tiny propeller whine + soft clicks when it heals.

**`tinker_iron_walker` — Iron Walker** (slot 6, level 40) `(new)` — gadget (counts as **2** toward the cap)
- 60 Focus · 120 s · 1.5 s build · placed up to 10 m · 20 s · health 150% of yours, armour as heavy.
- Walks to the nearest/Tagged enemy (3 m/s). Every 2 s: **punch 200% weapon** in a 3 m 90° arc. Every 6 s: **rocket volley**, 6 rockets at up to 3 enemies within 20 m, 60% weapon each in 4 m.
- **Climb In** (interact key `E` while within 3 m): you ride inside for the rest of its time; your spell bar becomes the **Walker bar** (§4). Its health becomes your shield (hits on you hit it first).
- Drops 3 Scrap when it ends.
- Look: a 3 m bipedal brass walker with a boiler back, pistons, and a cockpit hatch (built from Chibi 2 parts scaled + `avatar-3d/js/vehicles.js` wheel/boiler pieces). Sound: heavy pistons, steam hisses, rocket whooshes.

---

## 4. Alternate spells — the Toolbelt and the Walker bar

### 4.1 Toolbelt models (Calling 20)

| Gadget | Model id | Name | What changes |
|---|---|---|---|
| Cog Sentry | `tinker_cog_sentry_bolt` | Bolt Sentry (default) | as §3 |
| Cog Sentry | `tinker_cog_sentry_flame` | Flame Sentry | 8 m, 60° cone, 5 ticks/s of 10% weapon fire + Burning (30% weapon over 3 s). |
| Cog Sentry | `tinker_cog_sentry_mender` | Mender Sentry | no damage; heals the lowest-health ally within 20 m for 60% weapon every 1.5 s. **Support** model. |
| Springtrap Mine | `tinker_springtrap_mine_jaw` | Jaw Mine (default) | as §3 |
| Springtrap Mine | `tinker_springtrap_mine_frost` | Frost Mine | 120% weapon ice, freeze 3 s (bosses: 30% slow cast/attack 4 s). |
| Springtrap Mine | `tinker_springtrap_mine_flash` | Flash Mine | 80% weapon, blinds 4 s, interrupts non-boss casts. |
| Iron Walker | `tinker_iron_walker_brawler` | Brawler (default) | as §3 |
| Iron Walker | `tinker_iron_walker_bulwark` | Bulwark Walker | taunts enemies within 8 m every 4 s, 300% your health, punches 120%; no rockets. Emergency off-tank. |
| Iron Walker | `tinker_iron_walker_artillery` | Artillery Walker | stands still, fires a 5 m mortar at 30 m every 2 s for 150% weapon; no punches. |

### 4.2 The Walker bar (while Climbed In)

| Key | id | Name | Numbers |
|---|---|---|---|
| 1 | `tinker_walker_haymaker` | Haymaker | 3 m arc, 260% weapon, knockback 4 m (non-boss). No cost, 2 s CD. |
| 2 | `tinker_walker_rocket_barrage` | Rocket Barrage | 8 rockets, ground target 30 m, 6 m area, 70% each. 8 s CD. |
| 3 | `tinker_walker_steam_vent` | Steam Vent | 6 m ring, 150% weapon, allies inside cleansed of one slow. 10 s CD. |
| 4 | `tinker_walker_eject` | Eject | leave the Walker; it overloads (as Overclock) 1 s later. |
Keys 5–6 are greyed out. Leaving by Eject or by the Walker's timer puts your normal bar back.

---

## 5. Talents (tiers at 12 / 22 / 32 / 45)

### Rivet Shot
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `tinker_rivet_shot_t1a` | Rivet Spray | 3 rivets in a 12° fan, 50% each. |
| 12 | `tinker_rivet_shot_t1b` | Magnet Rivet | The rivet stays in the target; your gadgets' shots on it do +15%. |
| 22 | `tinker_rivet_shot_t2a` | Salvage Tip | Kills with Rivet Shot drop 1 Scrap. |
| 22 | `tinker_rivet_shot_t2b` | Arc Rivet | Chains to 2 enemies within 6 m of your gadgets, 60%. |
| 32 | `tinker_rivet_shot_t3a` | Spot Weld | Hitting your own gadget (yes, shoot it) repairs it 15% and adds 2 s. |
| 32 | `tinker_rivet_shot_t3b` | Coilgun | Hold to charge 1.2 s: 280% weapon, pierces all. |
| 45 | `tinker_rivet_shot_t4a` | Autoloader | Every 4th Rivet Shot is free and fires from every gadget too (35%). |
| 45 | `tinker_rivet_shot_t4b` | Tuning Fork | Rivet Shot adds 1 s to every gadget within 10 m of the target. |

### Cog Sentry
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `tinker_cog_sentry_t1a` | Twin Sentries | 2 Cog Sentries allowed, each at 70%. |
| 12 | `tinker_cog_sentry_t1b` | Throwable | Instant: you throw it 25 m; it unfolds on landing. |
| 22 | `tinker_cog_sentry_t2a` | Reactive Plating | When hit, fires back at the attacker (35%, 1 s ICD). |
| 22 | `tinker_cog_sentry_t2b` | Tripod Legs | The sentry follows you at 4 m. |
| 32 | `tinker_cog_sentry_t3a` | Last Round | When it expires, fires a 10-shot burst at its target. |
| 32 | `tinker_cog_sentry_t3b` | Salvage Frame | Drops 2 Scrap instead of 1. |
| 45 | `tinker_cog_sentry_t4a` | Sentry Nest | Becomes 3 mini-sentries (each 20%, 12 m reach) that each count as a separate Linkage node but one gadget toward the cap. |
| 45 | `tinker_cog_sentry_t4b` | Overclock Governor | Overclocking a sentry does not destroy it (no overload blast, no Scrap back). |

### Springtrap Mine
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `tinker_springtrap_mine_t1a` | Minefield | 5 mines in a 5 m circle at the target point. |
| 12 | `tinker_springtrap_mine_t1b` | Sticky Mine | One mine, thrown at an enemy: sticks, blows after 2 s for 350% in 5 m. |
| 22 | `tinker_springtrap_mine_t2a` | Tripwire | Mines within 8 m of each other are joined by a wire; an enemy crossing a wire triggers both ends. |
| 22 | `tinker_springtrap_mine_t2b` | Chain Blast | A mine exploding triggers every other mine within 6 m. |
| 32 | `tinker_springtrap_mine_t3a` | Bouncing Betty | Mines hop 1.5 m up before bursting: +50% and knock down non-bosses 1 s. |
| 32 | `tinker_springtrap_mine_t3b` | Scrap Jaws | Each mine that triggers drops 1 Scrap. |
| 45 | `tinker_springtrap_mine_t4a` | Seeker Mines | Mines crawl toward the nearest enemy within 10 m at 2 m/s. |
| 45 | `tinker_springtrap_mine_t4b` | Soak Plate | You take 50% less damage from soaks (orange circles). Mines, like pets and summons, never count toward soak pips — See QUESTIONS.md C3. |

### Aether Battery
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `tinker_aether_battery_t1a` | Backpack Battery | Worn on your back, aura around you (6 m). |
| 12 | `tinker_aether_battery_t1b` | Twin Cells | Two batteries at two points, 5 m auras. |
| 22 | `tinker_aether_battery_t2a` | Surge Line | Casting it also gives allies inside +20% move speed for 4 s. |
| 22 | `tinker_aether_battery_t2b` | Capacitor | Stores 20% of damage dealt by allies inside; when it ends, releases it as a 6 m blast. |
| 32 | `tinker_aether_battery_t3a` | Grounding Rod | Allies inside take 25% less lightning and chain damage. |
| 32 | `tinker_aether_battery_t3b` | Recharge | Scrap within 8 m of it is worth double. |
| 45 | `tinker_aether_battery_t4a` | Overcharge Field | Allies inside also get +10% damage. |
| 45 | `tinker_aether_battery_t4b` | Perpetual Engine | Lasts as long as it is inside a Linkage (Calling 40) with 2+ gadgets, up to 30 s. |

### Patchwork Drone
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `tinker_patchwork_drone_t1a` | Hopping Drone | After 5 s it hops to the lowest-health ally within 20 m. |
| 12 | `tinker_patchwork_drone_t1b` | Two Drones | 2 charges. |
| 22 | `tinker_patchwork_drone_t2a` | Solder Shield | Starts with a barrier of 10% max HP on the ally. |
| 22 | `tinker_patchwork_drone_t2b` | Cleaning Arm | Removes one poison or bleed on arrival. |
| 32 | `tinker_patchwork_drone_t3a` | Jump Leads | Cast on a **dead** ally: revives them at 20% health after a 4 s channel (the Tinker's only revive; 10 min cooldown for that use, page 05 battle-revive rules). |
| 32 | `tinker_patchwork_drone_t3b` | Last Weld | The barrier on pop is 35%. |
| 45 | `tinker_patchwork_drone_t4a` | Swarm | 3 small drones on 3 allies at 50% each. |
| 45 | `tinker_patchwork_drone_t4b` | Attack Drone | On yourself it also fires 40% weapon shots every 1 s. |

### Iron Walker
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `tinker_iron_walker_t1a` | Quick Build | Instant build, but lasts 15 s. |
| 12 | `tinker_iron_walker_t1b` | Heavy Frame | Lasts 30 s and counts as 3 gadgets. |
| 22 | `tinker_iron_walker_t2a` | Jump Jets | The Walker can leap 12 m to a target every 8 s (lands for 150% in 4 m). |
| 22 | `tinker_iron_walker_t2b` | Passenger Seat | An ally can Climb In instead of you (their bar becomes the Walker bar). |
| 32 | `tinker_iron_walker_t3a` | Scrap Furnace | Each Scrap you pick up while it is out adds 1 s. |
| 32 | `tinker_iron_walker_t3b` | Self-Destruct | Its end is an overload at 400% in 8 m. |
| 45 | `tinker_iron_walker_t4a` | Twin Walkers | Two walkers at 60%, each counts 2. |
| 45 | `tinker_iron_walker_t4b` | Colossus | 5 m tall, 300% punches, rockets every 3 s; counts as 5 gadgets (so it is your only gadget). |

---

## 6. Rotation / how it plays

- **Solo:** Cog Sentry and mines placed where the pull will run → Rivet Shot to pull → enemies walk into the mines → Overclock the sentry as it runs out → pick up the Scrap. Patchwork Drone on yourself is your self-heal.
- **Dungeon (damage):** pre-place mines and sentry at every pull, Battery on the group for the boss, Walker on cooldown. **Support build:** Mender Sentry + Battery + Drone on the tank + Flash Mines for interrupts.
- **Raid:** gadgets do not move, bosses do. Place for the next phase, not this one. Battery on the melee stack. Walker (Artillery) is ideal for "stand still" phases.

## 7. Boss mechanics

| Mechanic | Tinker answer |
|---|---|
| Room-wide damage | Patchwork Drone barrier; Battery speed to finish phases faster. |
| Soaks | Gadgets never count toward soak pips (00 §10). Soak Plate talent: you take 50% less damage from soaks. |
| Boss cleaves gadgets | Gadgets have health; bosses with room-wide attacks hit them too — expect to rebuild (Scrap back). |
| Moving fights | Throwable sentry, Tripod Legs, Backpack Battery. |
| Interrupts | Flash Mine (non-boss); no boss interrupt. |
| Adds | Minefield + Chain Blast where adds spawn. Bulwark Walker holds adds for 20 s. |
| "Do not stand still" void zones | Place gadgets outside the zone line — they cannot be moved. |

---

## 8. Class sets

### `set_tinker_workshop_harness` — The Workshop Harness (levels 13–18)
Drops: `d03_deepdelve`, `d04_bellows_keep` bosses (Normal, 15%); complete on Heroic.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Gadgets last +20%. | all gadgets |
| 4 | Cog Sentry's shots have a 10% chance to drop 1 Scrap. | `tinker_cog_sentry` |
| 6 | Springtrap Mine throws 4 mines. | `tinker_springtrap_mine` |

### `set_tinker_unmade_blueprints` — The Unmade Blueprints (levels 48–51)
Drops: `d12_unmade_workshop` bosses (Normal 15%); complete on Heroic.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Overclock costs 2 Scrap. | Overclock |
| 4 | Overloads (Overclock blasts) heal allies within 5 m for 60% weapon. | Overclock |
| 6 | Iron Walker builds a free Cog Sentry on its shoulder (does not count toward the cap). | `tinker_iron_walker` |

### `set_tinker_emberforge_rig` — Emberforge Rig (level 60)
Drops: `r04_ember_court`, token system; 6th piece Mythic only.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Aether Battery lasts 18 s. | `tinker_aether_battery` |
| 4 | Patchwork Drone pops at 40% health instead of 30% and can pop twice. | `tinker_patchwork_drone` |
| 6 | Contraption fires every 6 s and needs only 4 linked gadgets. | Linkage |

---

## 9. Legendaries and uniques

| id | Name | Slot | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_perpetual_spring` | The Perpetual Spring | trinket / neck | Gadget cap +1 (max 6). | `b_oddrin_the_unmaker` Vell Oddrin, the Unmaker (`d12_unmade_workshop` end boss), Heroic/Mythic+ (4%) |
| `leg_masterwright_goggles` | Masterwright's Goggles | head | Overclocked gadgets no longer overload; they return to normal and Overclock costs 4 Scrap. | `b_mirror_court` The Mirror Court (`r05_veilspire` boss 4), Mythic 6% |
| `leg_scrapheart_crossbow` | Scrapheart Crossbow | crossbow | Rivet Shot spends 1 Scrap if you have 5+ for 300% weapon and 5 m splash. | `b_unmoored` The Unmoored (Riftmarch world boss), weekly 6% |
| `leg_pocketwatch_of_the_first_cog` | Pocketwatch of the First Cog | neck | Every 30 s, the next gadget you place is built at double effect (sentry 70%, battery +30%, etc.). | `b_drowned_cantor` The Drowned Cantor (`r03_sunken_choir` boss 3), 8% |
| `leg_the_walking_forge` | The Walking Forge | chest | Iron Walker's cooldown drops 5 s per Scrap you spend while it is on cooldown. | `b_ember_king_kaedros` Kaedros, the Ember King (`r04_ember_court` boss 8), Mythic 5% |
| `uq_brass_knuckle_crossbow` | Brass-Knuckle Crossbow | hand crossbow | Rivet Shot staggers non-bosses 0.5 s. | `b_hollow_thane` The Hollow Thane (`d01_hollow_barrow` end boss), Normal 12% |
| `uq_clicking_satchel` | The Clicking Satchel | waist | Scrap cap 15. | `b_the_great_bellows` The Great Bellows (`d04_bellows_keep` main boss 2) |
| `uq_mothwing_gloves` | Mothwing Gloves | hands | Patchwork Drone moves with its ally at double speed and heals +20%. | `b_wyllow_blighted_heart` Wyllow, the Blighted Heart (`d07_thornheart` end boss) |

---

## 10. Voice and barks

- Timbre: `voiceFor({ role: 'support', gender, seed })`, quick, a mild tic (a clicking tongue "tk" before lines — Lingo verbal tic). `(reuse: shared/voices.js, lingo tics)`

| Event | Lines |
|---|---|
| Place gadget | "Tk — set." · "Don't touch that." · "Wind it and walk away." |
| Overclock | "Past the red line!" · "Let's see if it holds." |
| Overload | "…Well, it held for a bit." |
| Walker | "Stand back, she's big." · "Climbing in!" |
| Scrap pickup | "Ooh, that's useful." |
| Crit | "Precision engineering." |
| Low health | "My warranty's expiring — heal!" · "Patch me up!" |
| Out of Focus | "Need a second to recalibrate." |

---

## 11. Reuse notes

| Wildmarch piece | Borrowed from | Notes |
|---|---|---|
| Cog Sentry | Farhold pet `clockwork_sentry` (`js/pets.js`) + `deploy_sentry` summon | now a timed gadget |
| Mines | Farhold `pinning_shot` root status visuals; spellfx physical impact | new mesh (brass disc) |
| Battery aura | Farhold `quicken` haste status + spellfx lightning ground disc | now a placed aura |
| Drone | spellfx holy_mote (brass tint) | new mesh |
| Iron Walker | `avatar-3d/js/vehicles.js` parts + Chibi 2 scaled rig | new model; the heaviest art task of the six |
| Outfit | `class-outfits.json` `tinker` (only `top` exists) — **complete it** from Farhold `tinker.look` (goggles_up, pocketwatch, gear_pack) | See QUESTIONS.md G4 |
| Emberveil ideas | `tinker_bolt`, `tinker_grenade`, `tinker_quick_fix`, `tinker_overcharge` | reborn as Rivet Shot, Springtrap Mine, Patchwork Drone, Aether Battery |
